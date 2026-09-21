import { describe, expect, it } from "vitest";
import {
  isValidEmail,
  isValidVerificationCode,
  passwordStrength,
  validateLogin,
  validateRegister
} from "./validation";

describe("isValidEmail", () => {
  it("接受常见邮箱", () => {
    expect(isValidEmail("luli@example.com")).toBe(true);
    expect(isValidEmail("a.b+c@sub.domain.cn")).toBe(true);
  });
  it("拒绝坏格式", () => {
    for (const bad of ["", "no-at.com", "a@b", "a @b.com", "@x.com", "a@.com"]) {
      expect(isValidEmail(bad)).toBe(false);
    }
  });
});

describe("passwordStrength", () => {
  it("短密码过短", () => {
    expect(passwordStrength("abc")).toBe(0);
    expect(passwordStrength("1234567")).toBe(0);
  });
  it("强度递增", () => {
    expect(passwordStrength("abcdefgh")).toBe(1);
    expect(passwordStrength("abcd1234")).toBe(2);
    expect(passwordStrength("Abcdef12")).toBe(3);
    expect(passwordStrength("Abcdef12!xyz")).toBe(4);
  });
});

describe("isValidVerificationCode", () => {
  it("仅接受 6 位数字", () => {
    expect(isValidVerificationCode("123456")).toBe(true);
    expect(isValidVerificationCode("12345")).toBe(false);
    expect(isValidVerificationCode("abcdef")).toBe(false);
    expect(isValidVerificationCode("1234567")).toBe(false);
  });
});

describe("validateRegister", () => {
  const ok = {
    displayName: "陆离",
    email: "luli@example.com",
    password: "Abcdef12",
    confirmPassword: "Abcdef12",
    acceptedTerms: true
  };
  it("合法输入无错误", () => {
    expect(validateRegister(ok)).toEqual({});
  });
  it("逐字段报错", () => {
    const e = validateRegister({
      displayName: "",
      email: "bad",
      password: "123",
      confirmPassword: "456",
      acceptedTerms: false
    });
    expect(Object.keys(e).sort()).toEqual([
      "acceptedTerms",
      "confirmPassword",
      "displayName",
      "email",
      "password"
    ]);
  });
});

describe("validateLogin", () => {
  it("空密码报错", () => {
    expect(validateLogin("luli@example.com", "")).toEqual({ password: "请输入密码" });
  });
  it("合法输入无错误", () => {
    expect(validateLogin("luli@example.com", "whatever")).toEqual({});
  });
});
