import type { AtelierApi } from "./types";
import { httpApi } from "./httpApi";
import { mockApi } from "./mock/mockApi";

/**
 * 数据访问入口。默认 mock；VITE_API_MODE=http 时切换真实后端。
 * 组件只依赖 AtelierApi 接口，不感知 provider。
 */
export const api: AtelierApi = import.meta.env.VITE_API_MODE === "http" ? httpApi : mockApi;

export const apiMode = import.meta.env.VITE_API_MODE === "http" ? "http" : "mock";
