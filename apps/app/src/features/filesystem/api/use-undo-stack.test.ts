import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useUndoStack } from "./use-undo-stack"

vi.mock("@/features/filesystem/infra/fs.gateway", () => ({
  fsGateway: {
    rename: vi.fn().mockResolvedValue(undefined),
    move: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock("@/shared/lib/logger", () => ({
  logger: { error: vi.fn() },
}))

import { fsGateway } from "@/features/filesystem/infra/fs.gateway"

const mockRename = fsGateway.rename as ReturnType<typeof vi.fn>
const mockMove = fsGateway.move as ReturnType<typeof vi.fn>

beforeEach(() => {
  mockRename.mockClear()
  mockMove.mockClear()
})

describe("useUndoStack", () => {
  it("canUndo false cuando stack vacío", () => {
    const { result } = renderHook(() => useUndoStack())
    expect(result.current.canUndo).toBe(false)
    expect(result.current.peek).toBe(null)
  })

  it("canUndo true después de push", () => {
    const { result } = renderHook(() => useUndoStack())
    act(() => result.current.push({ type: "rename", oldPath: "/a/foo.txt", newPath: "/a/bar.txt" }))
    expect(result.current.canUndo).toBe(true)
    expect(result.current.peek?.type).toBe("rename")
  })

  it("undo rename llama rename con nombre original", async () => {
    const { result } = renderHook(() => useUndoStack())
    act(() => result.current.push({ type: "rename", oldPath: "/a/foo.txt", newPath: "/a/bar.txt" }))
    await act(async () => {
      const ok = await result.current.undo()
      expect(ok).toBe(true)
    })
    expect(mockRename).toHaveBeenCalledWith("/a/bar.txt", "foo.txt")
  })

  it("undo move llama move de dest a from", async () => {
    const { result } = renderHook(() => useUndoStack())
    act(() => result.current.push({
      type: "move",
      moves: [{ from: "/a/file.txt", to: "/b/file.txt" }],
    }))
    await act(async () => { await result.current.undo() })
    expect(mockMove).toHaveBeenCalledWith("/b/file.txt", "/a/file.txt")
  })

  it("undo move batch invierte todos los moves", async () => {
    const { result } = renderHook(() => useUndoStack())
    act(() => result.current.push({
      type: "move",
      moves: [
        { from: "/a/x.txt", to: "/b/x.txt" },
        { from: "/a/y.txt", to: "/b/y.txt" },
      ],
    }))
    await act(async () => { await result.current.undo() })
    expect(mockMove).toHaveBeenCalledTimes(2)
    expect(mockMove).toHaveBeenCalledWith("/b/x.txt", "/a/x.txt")
    expect(mockMove).toHaveBeenCalledWith("/b/y.txt", "/a/y.txt")
  })

  it("undo pop stack tras éxito", async () => {
    const { result } = renderHook(() => useUndoStack())
    act(() => result.current.push({ type: "rename", oldPath: "/a/foo.txt", newPath: "/a/bar.txt" }))
    act(() => result.current.push({ type: "rename", oldPath: "/a/x.txt", newPath: "/a/y.txt" }))
    await act(async () => { await result.current.undo() })
    expect(result.current.canUndo).toBe(true)
    await act(async () => { await result.current.undo() })
    expect(result.current.canUndo).toBe(false)
  })

  it("undo retorna false cuando stack vacío", async () => {
    const { result } = renderHook(() => useUndoStack())
    const ok = await act(async () => result.current.undo())
    expect(ok).toBe(false)
  })

  it("undo retorna false y mantiene stack cuando falla IPC", async () => {
    mockRename.mockRejectedValueOnce(new Error("ENOENT"))
    const { result } = renderHook(() => useUndoStack())
    act(() => result.current.push({ type: "rename", oldPath: "/a/foo.txt", newPath: "/a/bar.txt" }))
    const ok = await act(async () => result.current.undo())
    expect(ok).toBe(false)
    expect(result.current.canUndo).toBe(true)
  })

  it("stack se limita a MAX_STACK (20)", () => {
    const { result } = renderHook(() => useUndoStack())
    act(() => {
      for (let i = 0; i < 25; i++) {
        result.current.push({ type: "rename", oldPath: `/a/${i}`, newPath: `/a/${i}b` })
      }
    })
    // canUndo true, pero stack interno limitado
    expect(result.current.canUndo).toBe(true)
    expect(result.current.peek).toMatchObject({ oldPath: "/a/24" })
  })
})
