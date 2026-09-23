import { describe, expect, it } from "vitest";
import {
  isValidUsername,
  passwordStrength,
  validateLogin,
  validateSetup
} from "./validation";

describe("isValidUsername", () => {
  it("接受 3–24 字符", () => {
    expect(isValidUsername("luli")).toBe(true);
    expect(isValidUsername("陆离")).toBe(false); // 2 字
    expect(isValidUsername("陆离离")).toBe(true);
  });
  it("拒绝过短过长", () => {
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername("x".repeat(25))).toBe(false);
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

describe("validateSetup", () => {
  const ok = {
    displayName: "陆离",
    username: "luli",
    password: "Abcdef12",
    confirmPassword: "Abcdef12"
  };
  it("合法输入无错误", () => {
    expect(validateSetup(ok)).toEqual({});
  });
  it("逐字段报错", () => {
    const e = validateSetup({
      displayName: "",
      username: "ab",
      password: "123",
      confirmPassword: "456"
    });
    expect(Object.keys(e).sort()).toEqual(["confirmPassword", "displayName", "password", "username"]);
  });
});

describe("validateLogin", () => {
  it("空字段报错", () => {
    expect(validateLogin("", "")).toEqual({ username: "请输入用户名", password: "请输入密码" });
  });
  it("合法输入无错误", () => {
    expect(validateLogin("luli", "whatever")).toEqual({});
  });
});
