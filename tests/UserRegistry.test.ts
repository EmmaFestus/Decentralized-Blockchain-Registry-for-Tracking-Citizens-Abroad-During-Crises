// UserRegistry.test.ts
import { describe, expect, it, beforeEach } from "vitest";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number; // number for error codes
}

interface UserProfile {
  id: string;
  nationality: string;
  fullName?: string;
  contactEmail?: string;
  contactPhone?: string;
  emergencyContact?: string;
  registeredAt: number;
  lastUpdated: number;
  verified: boolean;
  verifier?: string;
  status: string;
  consentDataSharing: boolean;
  tags: string[];
}

interface AuditLog {
  actor: string;
  action: string;
  targetUser?: string;
  timestamp: number;
  details?: string;
}

interface ContractState {
  users: Map<string, UserProfile>;
  authorities: Map<string, boolean>;
  auditLogs: Map<number, AuditLog>;
  contractAdmin: string;
  paused: boolean;
  registrationCounter: number;
}

// Mock contract implementation
class UserRegistryMock {
  private state: ContractState = {
    users: new Map(),
    authorities: new Map(),
    auditLogs: new Map(),
    contractAdmin: "deployer",
    paused: false,
    registrationCounter: 0,
  };

  private ERR_ALREADY_REGISTERED = 100;
  private ERR_NOT_REGISTERED = 101;
  private ERR_UNAUTHORIZED = 102;
  private ERR_INVALID_INPUT = 103;
  private ERR_NOT_VERIFIED = 104;
  private ERR_ALREADY_VERIFIED = 105;
  private ERR_PAUSED = 106;
  private ERR_INVALID_STATUS = 107;
  private ERR_MAX_FIELD_LENGTH = 108;

  private MAX_STRING_LEN = 100;
  private MAX_TAGS = 5;

  private logAction(action: string, target?: string, details?: string): ClarityResponse<number> {
    const logId = this.state.registrationCounter;
    this.state.auditLogs.set(logId, {
      actor: this.txSender,
      action,
      targetUser: target,
      timestamp: this.blockHeight,
      details,
    });
    this.state.registrationCounter += 1;
    return { ok: true, value: logId };
  }

  private isAdmin(caller: string): boolean {
    return caller === this.state.contractAdmin || this.state.authorities.get(caller) || false;
  }

  private validateString(str: string, maxLen: number): boolean {
    return str.length > 0 && str.length <= maxLen;
  }

  // Simulate tx-sender and block-height for testing
  private txSender: string = "deployer";
  private blockHeight: number = 100;

  setTxSender(sender: string) {
    this.txSender = sender;
  }

  setBlockHeight(height: number) {
    this.blockHeight = height;
  }

  registerUser(
    id: string,
    nationality: string,
    fullName?: string,
    contactEmail?: string,
    contactPhone?: string,
    emergencyContact?: string,
    tags: string[] = []
  ): ClarityResponse<boolean> {
    if (this.state.paused) return { ok: false, value: this.ERR_PAUSED };
    if (this.state.users.has(this.txSender)) return { ok: false, value: this.ERR_ALREADY_REGISTERED };
    if (!this.validateString(id, this.MAX_STRING_LEN)) return { ok: false, value: this.ERR_INVALID_INPUT };
    if (!this.validateString(nationality, this.MAX_STRING_LEN)) return { ok: false, value: this.ERR_INVALID_INPUT };
    if (tags.length > this.MAX_TAGS) return { ok: false, value: this.ERR_INVALID_INPUT };

    this.state.users.set(this.txSender, {
      id,
      nationality,
      fullName,
      contactEmail,
      contactPhone,
      emergencyContact,
      registeredAt: this.blockHeight,
      lastUpdated: this.blockHeight,
      verified: false,
      status: "active",
      consentDataSharing: false,
      tags,
    });
    this.logAction("register-user", this.txSender);
    return { ok: true, value: true };
  }

  updateProfile(
    fullName?: string,
    contactEmail?: string,
    contactPhone?: string,
    emergencyContact?: string,
    tags: string[] = []
  ): ClarityResponse<boolean> {
    const userProfile = this.state.users.get(this.txSender);
    if (!userProfile) return { ok: false, value: this.ERR_NOT_REGISTERED };
    if (this.state.paused) return { ok: false, value: this.ERR_PAUSED };
    if (tags.length > this.MAX_TAGS) return { ok: false, value: this.ERR_INVALID_INPUT };

    this.state.users.set(this.txSender, {
      ...userProfile,
      fullName,
      contactEmail,
      contactPhone,
      emergencyContact,
      lastUpdated: this.blockHeight,
      tags,
    });
    this.logAction("update-profile", this.txSender);
    return { ok: true, value: true };
  }

  setConsent(consent: boolean): ClarityResponse<boolean> {
    const userProfile = this.state.users.get(this.txSender);
    if (!userProfile) return { ok: false, value: this.ERR_NOT_REGISTERED };
    if (this.state.paused) return { ok: false, value: this.ERR_PAUSED };

    this.state.users.set(this.txSender, {
      ...userProfile,
      consentDataSharing: consent,
      lastUpdated: this.blockHeight,
    });
    this.logAction("set-consent", this.txSender, consent ? "granted" : "revoked");
    return { ok: true, value: true };
  }

  updateStatus(newStatus: string): ClarityResponse<boolean> {
    const userProfile = this.state.users.get(this.txSender);
    if (!userProfile) return { ok: false, value: this.ERR_NOT_REGISTERED };
    if (this.state.paused) return { ok: false, value: this.ERR_PAUSED };
    if (!["active", "inactive", "in-crisis"].includes(newStatus)) return { ok: false, value: this.ERR_INVALID_STATUS };

    this.state.users.set(this.txSender, {
      ...userProfile,
      status: newStatus,
      lastUpdated: this.blockHeight,
    });
    this.logAction("update-status", this.txSender, newStatus);
    return { ok: true, value: true };
  }

  verifyUser(user: string): ClarityResponse<boolean> {
    const userProfile = this.state.users.get(user);
    if (!userProfile) return { ok: false, value: this.ERR_NOT_REGISTERED };
    if (!this.isAdmin(this.txSender)) return { ok: false, value: this.ERR_UNAUTHORIZED };
    if (userProfile.verified) return { ok: false, value: this.ERR_ALREADY_VERIFIED };

    this.state.users.set(user, {
      ...userProfile,
      verified: true,
      verifier: this.txSender,
      lastUpdated: this.blockHeight,
    });
    this.logAction("verify-user", user);
    return { ok: true, value: true };
  }

  addAuthority(auth: string): ClarityResponse<boolean> {
    if (this.txSender !== this.state.contractAdmin) return { ok: false, value: this.ERR_UNAUTHORIZED };
    this.state.authorities.set(auth, true);
    this.logAction("add-authority", auth);
    return { ok: true, value: true };
  }

  removeAuthority(auth: string): ClarityResponse<boolean> {
    if (this.txSender !== this.state.contractAdmin) return { ok: false, value: this.ERR_UNAUTHORIZED };
    this.state.authorities.set(auth, false);
    this.logAction("remove-authority", auth);
    return { ok: true, value: true };
  }

  pauseContract(): ClarityResponse<boolean> {
    if (this.txSender !== this.state.contractAdmin) return { ok: false, value: this.ERR_UNAUTHORIZED };
    this.state.paused = true;
    this.logAction("pause-contract");
    return { ok: true, value: true };
  }

  unpauseContract(): ClarityResponse<boolean> {
    if (this.txSender !== this.state.contractAdmin) return { ok: false, value: this.ERR_UNAUTHORIZED };
    this.state.paused = false;
    this.logAction("unpause-contract");
    return { ok: true, value: true };
  }

  transferAdmin(newAdmin: string): ClarityResponse<boolean> {
    if (this.txSender !== this.state.contractAdmin) return { ok: false, value: this.ERR_UNAUTHORIZED };
    this.state.contractAdmin = newAdmin;
    this.logAction("transfer-admin", newAdmin);
    return { ok: true, value: true };
  }

  getUser(user: string): ClarityResponse<UserProfile | null> {
    return { ok: true, value: this.state.users.get(user) ?? null };
  }

  isRegistered(user: string): ClarityResponse<boolean> {
    return { ok: true, value: this.state.users.has(user) };
  }

  isUserVerified(user: string): ClarityResponse<boolean> {
    const profile = this.state.users.get(user);
    return { ok: true, value: profile ? profile.verified : false };
  }

  hasConsent(user: string): ClarityResponse<boolean> {
    const profile = this.state.users.get(user);
    return { ok: true, value: profile ? profile.consentDataSharing : false };
  }

  getUserStatus(user: string): ClarityResponse<string> {
    const profile = this.state.users.get(user);
    return { ok: true, value: profile ? profile.status : "unknown" };
  }

  getAuditLog(logId: number): ClarityResponse<AuditLog | null> {
    return { ok: true, value: this.state.auditLogs.get(logId) ?? null };
  }

  getRegistrationCount(): ClarityResponse<number> {
    return { ok: true, value: this.state.registrationCounter };
  }

  isContractPaused(): ClarityResponse<boolean> {
    return { ok: true, value: this.state.paused };
  }

  getContractAdmin(): ClarityResponse<string> {
    return { ok: true, value: this.state.contractAdmin };
  }

  isAuthority(auth: string): ClarityResponse<boolean> {
    return { ok: true, value: this.state.authorities.get(auth) ?? false };
  }
}

// Test setup
const accounts = {
  deployer: "deployer",
  user1: "wallet_1",
  user2: "wallet_2",
  authority: "wallet_3",
};

describe("UserRegistry Contract", () => {
  let contract: UserRegistryMock;

  beforeEach(() => {
    contract = new UserRegistryMock();
  });

  it("should allow user to register with basic info", () => {
    contract.setTxSender(accounts.user1);
    const register = contract.registerUser("ID123", "USA", "John Doe", "john@example.com");
    expect(register).toEqual({ ok: true, value: true });

    const user = contract.getUser(accounts.user1);
    expect(user.value).toMatchObject({
      id: "ID123",
      nationality: "USA",
      fullName: "John Doe",
      contactEmail: "john@example.com",
      verified: false,
      status: "active",
      consentDataSharing: false,
    });
  });

  it("should prevent duplicate registration", () => {
    contract.setTxSender(accounts.user1);
    contract.registerUser("ID123", "USA");
    const secondRegister = contract.registerUser("ID456", "CAN");
    expect(secondRegister).toEqual({ ok: false, value: 100 });
  });

  it("should allow profile updates", () => {
    contract.setTxSender(accounts.user1);
    contract.registerUser("ID123", "USA");
    const update = contract.updateProfile("Updated Name", "updated@example.com", undefined, undefined, ["traveler"]);
    expect(update).toEqual({ ok: true, value: true });

    const user = contract.getUser(accounts.user1);
    expect(user.value).toMatchObject({
      fullName: "Updated Name",
      contactEmail: "updated@example.com",
      tags: ["traveler"],
    });
  });

  it("should manage consent", () => {
    contract.setTxSender(accounts.user1);
    contract.registerUser("ID123", "USA");
    const setConsent = contract.setConsent(true);
    expect(setConsent).toEqual({ ok: true, value: true });
    expect(contract.hasConsent(accounts.user1)).toEqual({ ok: true, value: true });
  });

  it("should update status correctly", () => {
    contract.setTxSender(accounts.user1);
    contract.registerUser("ID123", "USA");
    const updateStatus = contract.updateStatus("in-crisis");
    expect(updateStatus).toEqual({ ok: true, value: true });
    expect(contract.getUserStatus(accounts.user1)).toEqual({ ok: true, value: "in-crisis" });
  });

  it("should prevent invalid status update", () => {
    contract.setTxSender(accounts.user1);
    contract.registerUser("ID123", "USA");
    const updateStatus = contract.updateStatus("invalid");
    expect(updateStatus).toEqual({ ok: false, value: 107 });
  });

  it("should allow admin to verify user", () => {
    contract.setTxSender(accounts.user1);
    contract.registerUser("ID123", "USA");

    contract.setTxSender(accounts.deployer);
    const verify = contract.verifyUser(accounts.user1);
    expect(verify).toEqual({ ok: true, value: true });
    expect(contract.isUserVerified(accounts.user1)).toEqual({ ok: true, value: true });
  });

  it("should prevent non-admin from verifying", () => {
    contract.setTxSender(accounts.user1);
    contract.registerUser("ID123", "USA");

    contract.setTxSender(accounts.user2);
    const verify = contract.verifyUser(accounts.user1);
    expect(verify).toEqual({ ok: false, value: 102 });
  });

  it("should manage authorities", () => {
    contract.setTxSender(accounts.deployer);
    const addAuth = contract.addAuthority(accounts.authority);
    expect(addAuth).toEqual({ ok: true, value: true });
    expect(contract.isAuthority(accounts.authority)).toEqual({ ok: true, value: true });

    const removeAuth = contract.removeAuthority(accounts.authority);
    expect(removeAuth).toEqual({ ok: true, value: true });
    expect(contract.isAuthority(accounts.authority)).toEqual({ ok: true, value: false });
  });

  it("should pause and unpause contract", () => {
    contract.setTxSender(accounts.deployer);
    const pause = contract.pauseContract();
    expect(pause).toEqual({ ok: true, value: true });
    expect(contract.isContractPaused()).toEqual({ ok: true, value: true });

    contract.setTxSender(accounts.user1);
    const registerDuringPause = contract.registerUser("ID123", "USA");
    expect(registerDuringPause).toEqual({ ok: false, value: 106 });

    contract.setTxSender(accounts.deployer);
    const unpause = contract.unpauseContract();
    expect(unpause).toEqual({ ok: true, value: true });
    expect(contract.isContractPaused()).toEqual({ ok: true, value: false });
  });

  it("should transfer admin role", () => {
    contract.setTxSender(accounts.deployer);
    const transfer = contract.transferAdmin(accounts.authority);
    expect(transfer).toEqual({ ok: true, value: true });
    expect(contract.getContractAdmin()).toEqual({ ok: true, value: accounts.authority });
  });

  it("should log actions correctly", () => {
    contract.setTxSender(accounts.user1);
    contract.registerUser("ID123", "USA");

    const log = contract.getAuditLog(0);
    expect(log.value).toMatchObject({
      actor: accounts.user1,
      action: "register-user",
      targetUser: accounts.user1,
    });
  });
});