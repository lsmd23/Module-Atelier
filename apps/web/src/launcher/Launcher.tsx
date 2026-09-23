import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Project } from "@module-atelier/contracts";
import { api } from "../api";
import { useUiStore } from "../state/uiStore";
import { useAuthStore } from "../auth/authStore";
import { AccountPopover } from "../components/AccountPopover";

/*
 * 启动器 / 项目库（FoundryVTT 的「世界」列表）。
 * 本地优先：项目即数据目录中的文件夹，创建/打开/重命名都是本机文件操作。
 * 导出/备份等需要后端路由的能力标注「待契约」。
 */

function ProjectCard({ project, onOpen }: { project: Project; onOpen: () => void }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);

  const rename = useMutation({
    mutationFn: () => api.renameProject(project.id, name.trim()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      setEditing(false);
    }
  });

  return (
    <div className="group rounded-lg border border-hairline bg-paper p-4 shadow-sm transition-shadow hover:shadow-md">
      {editing ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && name.trim() !== project.name) rename.mutate();
            else setEditing(false);
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className="min-w-0 flex-1 rounded border border-brass bg-parchment px-2 py-1 text-sm outline-none"
          />
          <button type="submit" className="text-xs text-forest hover:underline">
            保存
          </button>
          <button type="button" onClick={() => setEditing(false)} className="text-xs text-ink-faint">
            取消
          </button>
        </form>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 truncate text-base font-semibold">{project.name}</h3>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="invisible rounded px-1.5 text-xs text-ink-faint hover:text-oxblood group-hover:visible"
              aria-label={`重命名「${project.name}」`}
              title="重命名"
            >
              ✎
            </button>
          </div>
          <p className="mt-1 text-xs text-ink-faint">
            更新于 {new Date(project.updatedAt).toLocaleString("zh-CN")}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={onOpen}
              className="rounded-md bg-ink px-3 py-1.5 text-xs text-paper hover:bg-ink-soft"
            >
              打开
            </button>
            <span
              className="cursor-not-allowed rounded-md border border-dashed border-hairline px-2.5 py-1.5 text-[11px] text-ink-faint"
              title="导出为压缩包（待后端路由契约）"
            >
              导出 · 待契约
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export function Launcher() {
  const openProject = useUiStore((s) => s.openProject);
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: () => api.listProjects() });
  const projects = projectsQuery.data ?? [];

  const createProject = useMutation({
    mutationFn: (name: string) => api.createProject(name),
    onSuccess: (p) => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      setCreating(false);
      setNewName("");
      openProject(p.id);
    }
  });

  return (
    <div className="flex min-h-full flex-col bg-parchment text-ink">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-hairline px-4">
        <span className="text-sm font-semibold tracking-wide text-oxblood">❦ Module Atelier</span>
        <span className="text-xs text-ink-faint">本机工作室</span>
        <div className="ml-auto flex items-center gap-2">
          <AccountPopover />
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 p-8">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold">项目库</h1>
            <p className="mt-1 text-sm text-ink-soft">
              {user ? `${user.displayName}，` : ""}每个项目是本机数据目录里的一个自包含文件夹——备份就是复制它。
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-md bg-oxblood px-4 py-2 text-sm text-paper hover:bg-oxblood-deep"
          >
            ＋ 新建项目
          </button>
        </div>

        {creating && (
          <form
            className="mb-6 flex items-center gap-2 rounded-lg border border-brass/50 bg-paper p-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (newName.trim()) createProject.mutate(newName.trim());
            }}
          >
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="项目名称（如：雾锁矿脉）"
              autoFocus
              className="min-w-0 flex-1 rounded border border-hairline bg-parchment px-3 py-2 text-sm outline-none focus:border-brass"
            />
            <button
              type="submit"
              disabled={createProject.isPending || !newName.trim()}
              className="rounded-md bg-ink px-4 py-2 text-sm text-paper hover:bg-ink-soft disabled:opacity-40"
            >
              创建
            </button>
            <button type="button" onClick={() => setCreating(false)} className="px-2 text-sm text-ink-faint">
              取消
            </button>
          </form>
        )}

        {projectsQuery.isLoading ? (
          <p className="py-16 text-center text-sm text-ink-faint">正在翻开书架…</p>
        ) : projects.length === 0 ? (
          <p className="rounded-lg border border-dashed border-hairline py-16 text-center text-sm text-ink-faint">
            书架上还空着。点「新建项目」写下第一个世界。
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} onOpen={() => openProject(p.id)} />
            ))}
          </div>
        )}

        <footer className="mt-10 border-t border-hairline pt-4 text-[11px] leading-relaxed text-ink-faint">
          数据目录：~/Library/Application Support/Module Atelier/（macOS）。协作邀请与项目导出将在
          对应后端契约冻结后开放。
        </footer>
      </main>
    </div>
  );
}
