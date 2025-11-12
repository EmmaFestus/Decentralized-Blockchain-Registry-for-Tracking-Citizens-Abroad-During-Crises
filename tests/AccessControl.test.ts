// access-control.test.ts

import { describe, it, expect, beforeEach } from "vitest";
import { stringUtf8CV, uintCV, optionalCV, boolCV, principalCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_AUTHORITY = 101;
const ERR_INVALID_CRISIS_ID = 102;
const ERR_INVALID_GRANT_DURATION = 103;
const ERR_INVALID_PERMISSION_TYPE = 104;
const ERR_PERMISSION_ALREADY_EXISTS = 105;
const ERR_PERMISSION_NOT_FOUND = 106;
const ERR_INVALID_TIMESTAMP = 107;
const ERR_AUTHORITY_NOT_VERIFIED = 108;
const ERR_INVALID_USER = 109;
const ERR_INVALID_EXPIRY = 110;
const ERR_PERMISSION_EXPIRED = 111;
const ERR_INVALID_UPDATE_PARAM = 112;
const ERR_MAX_PERMISSIONS_EXCEEDED = 113;
const ERR_INVALID_PERMISSION_LEVEL = 114;
const ERR_INVALID_LOCATION = 115;
const ERR_INVALID_STATUS = 116;
const ERR_INVALID_SCOPE = 117;
const ERR_INVALID_ROLE = 118;
const ERR_ROLE_ALREADY_ASSIGNED = 119;
const ERR_ROLE_NOT_FOUND = 120;

interface Permission {
  user: string;
  authority: string;
  granted: boolean;
  crisisId: number | null;
  timestamp: number;
  expiry: number | null;
  permissionType: string;
  scope: string;
  level: number;
  location: string;
  status: boolean;
}

interface PermissionUpdate {
  updateGranted: boolean;
  updateCrisisId: number | null;
  updateTimestamp: number;
  updater: string;
  updateExpiry: number | null;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class AccessControlMock {
  state: {
    nextPermissionId: number;
    maxPermissions: number;
    permissionFee: number;
    authorityContract: string | null;
    permissions: Map<number, Permission>;
    permissionUpdates: Map<number, PermissionUpdate>;
    permissionsByUserAuthority: Map<string, number>;
    roles: Map<string, boolean>;
  } = {
    nextPermissionId: 0,
    maxPermissions: 10000,
    permissionFee: 500,
    authorityContract: null,
    permissions: new Map(),
    permissionUpdates: new Map(),
    permissionsByUserAuthority: new Map(),
    roles: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextPermissionId: 0,
      maxPermissions: 10000,
      permissionFee: 500,
      authorityContract: null,
      permissions: new Map(),
      permissionUpdates: new Map(),
      permissionsByUserAuthority: new Map(),
      roles: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.stxTransfers = [];
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: false };
    }
    if (this.state.authorityContract !== null) {
      return { ok: false, value: false };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setMaxPermissions(newMax: number): Result<boolean> {
    if (newMax <= 0) return { ok: false, value: false };
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.maxPermissions = newMax;
    return { ok: true, value: true };
  }

  setPermissionFee(newFee: number): Result<boolean> {
    if (newFee < 0) return { ok: false, value: false };
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.permissionFee = newFee;
    return { ok: true, value: true };
  }

  grantAccess(
    authority: string,
    crisisId: number | null,
    expiry: number | null,
    permissionType: string,
    scope: string,
    level: number,
    location: string
  ): Result<number> {
    if (this.state.nextPermissionId >= this.state.maxPermissions) return { ok: false, value: ERR_MAX_PERMISSIONS_EXCEEDED };
    if (authority === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_AUTHORITY };
    if (!["read", "write", "admin"].includes(permissionType)) return { ok: false, value: ERR_INVALID_PERMISSION_TYPE };
    if (!scope || scope.length > 100) return { ok: false, value: ERR_INVALID_SCOPE };
    if (level > 10) return { ok: false, value: ERR_INVALID_PERMISSION_LEVEL };
    if (!location || location.length > 100) return { ok: false, value: ERR_INVALID_LOCATION };
    if (this.caller === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_USER };
    const key = `${this.caller}-${authority}`;
    if (this.state.permissionsByUserAuthority.has(key)) return { ok: false, value: ERR_PERMISSION_ALREADY_EXISTS };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    this.stxTransfers.push({ amount: this.state.permissionFee, from: this.caller, to: this.state.authorityContract });
    const id = this.state.nextPermissionId;
    const permission: Permission = {
      user: this.caller,
      authority: authority,
      granted: true,
      crisisId,
      timestamp: this.blockHeight,
      expiry,
      permissionType,
      scope,
      level,
      location,
      status: true,
    };
    this.state.permissions.set(id, permission);
    this.state.permissionsByUserAuthority.set(key, id);
    this.state.nextPermissionId++;
    return { ok: true, value: id };
  }

  revokeAccess(authority: string): Result<boolean> {
    const key = `${this.caller}-${authority}`;
    const permId = this.state.permissionsByUserAuthority.get(key);
    if (permId === undefined) return { ok: false, value: false };
    const perm = this.state.permissions.get(permId);
    if (!perm || perm.user !== this.caller) return { ok: false, value: false };
    this.state.permissions.set(permId, { ...perm, granted: false, status: false });
    this.state.permissionsByUserAuthority.delete(key);
    return { ok: true, value: true };
  }

  updatePermission(
    permId: number,
    updateGranted: boolean,
    updateCrisisId: number | null,
    updateExpiry: number | null
  ): Result<boolean> {
    const perm = this.state.permissions.get(permId);
    if (!perm) return { ok: false, value: false };
    if (perm.user !== this.caller) return { ok: false, value: false };
    const updated: Permission = {
      ...perm,
      granted: updateGranted,
      crisisId: updateCrisisId,
      timestamp: this.blockHeight,
      expiry: updateExpiry,
    };
    this.state.permissions.set(permId, updated);
    this.state.permissionUpdates.set(permId, {
      updateGranted,
      updateCrisisId,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
      updateExpiry,
    });
    return { ok: true, value: true };
  }

  assignRole(target: string, role: string): Result<boolean> {
    if (!["admin", "moderator", "user"].includes(role)) return { ok: false, value: false };
    if (!this.state.authorityContract) return { ok: false, value: false };
    const roleKey = `${target}-${role}`;
    if (this.state.roles.has(roleKey)) return { ok: false, value: false };
    this.state.roles.set(roleKey, true);
    return { ok: true, value: true };
  }

  revokeRole(target: string, role: string): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    const roleKey = `${target}-${role}`;
    if (!this.state.roles.has(roleKey)) return { ok: false, value: false };
    this.state.roles.delete(roleKey);
    return { ok: true, value: true };
  }

  getPermission(id: number): Permission | null {
    return this.state.permissions.get(id) || null;
  }

  hasAccess(user: string, authority: string): boolean {
    const key = `${user}-${authority}`;
    const permId = this.state.permissionsByUserAuthority.get(key);
    if (permId === undefined) return false;
    const perm = this.state.permissions.get(permId);
    if (!perm) return false;
    if (!perm.granted || !perm.status) return false;
    if (perm.expiry !== null && perm.expiry <= this.blockHeight) return false;
    return true;
  }

  getPermissionCount(): Result<number> {
    return { ok: true, value: this.state.nextPermissionId };
  }

  checkPermissionExistence(user: string, authority: string): Result<boolean> {
    return { ok: true, value: this.hasAccess(user, authority) };
  }

  getRole(p: string, role: string): boolean | null {
    const roleKey = `${p}-${role}`;
    return this.state.roles.get(roleKey) || null;
  }
}

describe("AccessControl", () => {
  let contract: AccessControlMock;

  beforeEach(() => {
    contract = new AccessControlMock();
    contract.reset();
  });

  it("grants access successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.grantAccess(
      "ST3AUTH",
      1,
      null,
      "read",
      "location",
      5,
      "CityZ"
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const perm = contract.getPermission(0);
    expect(perm?.user).toBe("ST1TEST");
    expect(perm?.authority).toBe("ST3AUTH");
    expect(perm?.granted).toBe(true);
    expect(perm?.crisisId).toBe(1);
    expect(perm?.permissionType).toBe("read");
    expect(perm?.scope).toBe("location");
    expect(perm?.level).toBe(5);
    expect(perm?.location).toBe("CityZ");
    expect(perm?.status).toBe(true);
    expect(contract.stxTransfers).toEqual([{ amount: 500, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects duplicate permission", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.grantAccess(
      "ST3AUTH",
      1,
      null,
      "read",
      "location",
      5,
      "CityZ"
    );
    const result = contract.grantAccess(
      "ST3AUTH",
      2,
      100,
      "write",
      "data",
      6,
      "TownA"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PERMISSION_ALREADY_EXISTS);
  });

  it("rejects invalid authority", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.grantAccess(
      "SP000000000000000000002Q6VF78",
      1,
      null,
      "read",
      "location",
      5,
      "CityZ"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_AUTHORITY);
  });

  it("rejects grant without authority contract", () => {
    const result = contract.grantAccess(
      "ST3AUTH",
      1,
      null,
      "read",
      "location",
      5,
      "CityZ"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_VERIFIED);
  });

  it("rejects invalid permission type", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.grantAccess(
      "ST3AUTH",
      1,
      null,
      "invalid",
      "location",
      5,
      "CityZ"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PERMISSION_TYPE);
  });

  it("rejects invalid level", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.grantAccess(
      "ST3AUTH",
      1,
      null,
      "read",
      "location",
      11,
      "CityZ"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PERMISSION_LEVEL);
  });

  it("rejects invalid location", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.grantAccess(
      "ST3AUTH",
      1,
      null,
      "read",
      "location",
      5,
      ""
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_LOCATION);
  });

  it("revokes access successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.grantAccess(
      "ST3AUTH",
      1,
      null,
      "read",
      "location",
      5,
      "CityZ"
    );
    const result = contract.revokeAccess("ST3AUTH");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const perm = contract.getPermission(0);
    expect(perm?.granted).toBe(false);
    expect(perm?.status).toBe(false);
  });

  it("rejects revoke for non-existent permission", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.revokeAccess("ST3AUTH");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("updates permission successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.grantAccess(
      "ST3AUTH",
      1,
      null,
      "read",
      "location",
      5,
      "CityZ"
    );
    const result = contract.updatePermission(0, false, 2, 100);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const perm = contract.getPermission(0);
    expect(perm?.granted).toBe(false);
    expect(perm?.crisisId).toBe(2);
    expect(perm?.expiry).toBe(100);
    const update = contract.state.permissionUpdates.get(0);
    expect(update?.updateGranted).toBe(false);
    expect(update?.updateCrisisId).toBe(2);
    expect(update?.updateExpiry).toBe(100);
    expect(update?.updater).toBe("ST1TEST");
  });

  it("rejects update for non-existent permission", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.updatePermission(99, false, 2, 100);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects update by non-user", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.grantAccess(
      "ST3AUTH",
      1,
      null,
      "read",
      "location",
      5,
      "CityZ"
    );
    contract.caller = "ST4FAKE";
    const result = contract.updatePermission(0, false, 2, 100);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("assigns role successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.assignRole("ST5TARGET", "admin");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const role = contract.getRole("ST5TARGET", "admin");
    expect(role).toBe(true);
  });

  it("rejects duplicate role assignment", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.assignRole("ST5TARGET", "admin");
    const result = contract.assignRole("ST5TARGET", "admin");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects role assignment without authority", () => {
    const result = contract.assignRole("ST5TARGET", "admin");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("revokes role successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.assignRole("ST5TARGET", "admin");
    const result = contract.revokeRole("ST5TARGET", "admin");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const role = contract.getRole("ST5TARGET", "admin");
    expect(role).toBe(null);
  });

  it("rejects revoke non-existent role", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.revokeRole("ST5TARGET", "admin");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("checks has access correctly", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.grantAccess(
      "ST3AUTH",
      1,
      null,
      "read",
      "location",
      5,
      "CityZ"
    );
    expect(contract.hasAccess("ST1TEST", "ST3AUTH")).toBe(true);
    contract.revokeAccess("ST3AUTH");
    expect(contract.hasAccess("ST1TEST", "ST3AUTH")).toBe(false);
  });

  it("handles expiry in has access", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.grantAccess(
      "ST3AUTH",
      1,
      10,
      "read",
      "location",
      5,
      "CityZ"
    );
    expect(contract.hasAccess("ST1TEST", "ST3AUTH")).toBe(true);
    contract.blockHeight = 11;
    expect(contract.hasAccess("ST1TEST", "ST3AUTH")).toBe(false);
  });

  it("sets permission fee successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setPermissionFee(1000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.permissionFee).toBe(1000);
    contract.grantAccess(
      "ST3AUTH",
      1,
      null,
      "read",
      "location",
      5,
      "CityZ"
    );
    expect(contract.stxTransfers).toEqual([{ amount: 1000, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects permission fee change without authority", () => {
    const result = contract.setPermissionFee(1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("returns correct permission count", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.grantAccess(
      "ST3AUTH1",
      1,
      null,
      "read",
      "location1",
      5,
      "City1"
    );
    contract.grantAccess(
      "ST3AUTH2",
      2,
      20,
      "write",
      "location2",
      6,
      "City2"
    );
    const result = contract.getPermissionCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("checks permission existence correctly", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.grantAccess(
      "ST3AUTH",
      1,
      null,
      "read",
      "location",
      5,
      "CityZ"
    );
    const result = contract.checkPermissionExistence("ST1TEST", "ST3AUTH");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const result2 = contract.checkPermissionExistence("ST1TEST", "ST4NON");
    expect(result2.ok).toBe(true);
    expect(result2.value).toBe(false);
  });

  it("rejects grant with max permissions exceeded", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.state.maxPermissions = 1;
    contract.grantAccess(
      "ST3AUTH1",
      1,
      null,
      "read",
      "location1",
      5,
      "City1"
    );
    const result = contract.grantAccess(
      "ST3AUTH2",
      2,
      null,
      "write",
      "location2",
      6,
      "City2"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_PERMISSIONS_EXCEEDED);
  });

  it("sets authority contract successfully", () => {
    const result = contract.setAuthorityContract("ST2TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.authorityContract).toBe("ST2TEST");
  });

  it("rejects invalid authority contract", () => {
    const result = contract.setAuthorityContract("SP000000000000000000002Q6VF78");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects invalid scope", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.grantAccess(
      "ST3AUTH",
      1,
      null,
      "read",
      "",
      5,
      "CityZ"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_SCOPE);
  });

  it("rejects invalid user", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.caller = "SP000000000000000000002Q6VF78";
    const result = contract.grantAccess(
      "ST3AUTH",
      1,
      null,
      "read",
      "location",
      5,
      "CityZ"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_USER);
  });

  it("rejects invalid role", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.assignRole("ST5TARGET", "invalid");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });
});