import { describe, it, expect } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useSelection, modeFromEvent } from "./use-selection"
import type { FileEntry } from "@/features/filesystem/domain/file-entry"

const makeEntries = (paths: string[]): FileEntry[] =>
  paths.map((p) => ({
    name: p,
    path: p,
    is_dir: false,
    size: 0,
    modified: 0,
    extension: null,
  }))

describe("modeFromEvent", () => {
  it("shift → range", () => {
    expect(modeFromEvent({ shiftKey: true, metaKey: false, ctrlKey: false })).toBe("range")
  })
  it("meta → toggle", () => {
    expect(modeFromEvent({ shiftKey: false, metaKey: true, ctrlKey: false })).toBe("toggle")
  })
  it("ctrl → toggle", () => {
    expect(modeFromEvent({ shiftKey: false, metaKey: false, ctrlKey: true })).toBe("toggle")
  })
  it("nada → replace", () => {
    expect(modeFromEvent({ shiftKey: false, metaKey: false, ctrlKey: false })).toBe("replace")
  })
})

describe("useSelection", () => {
  const entries = makeEntries(["a", "b", "c", "d", "e"])

  it("replace coloca solo un path", () => {
    const { result } = renderHook(() => useSelection())
    act(() => result.current.select("b", "replace", entries))
    expect(Array.from(result.current.selectedPaths)).toEqual(["b"])
    expect(result.current.anchorPath).toBe("b")
  })

  it("toggle agrega y quita", () => {
    const { result } = renderHook(() => useSelection())
    act(() => result.current.select("a", "replace", entries))
    act(() => result.current.select("c", "toggle", entries))
    expect(result.current.selectedPaths.size).toBe(2)
    expect(result.current.isSelected("a")).toBe(true)
    expect(result.current.isSelected("c")).toBe(true)

    act(() => result.current.select("a", "toggle", entries))
    expect(result.current.isSelected("a")).toBe(false)
    expect(result.current.isSelected("c")).toBe(true)
  })

  it("range selecciona desde anchor", () => {
    const { result } = renderHook(() => useSelection())
    act(() => result.current.select("b", "replace", entries))
    act(() => result.current.select("d", "range", entries))
    expect(Array.from(result.current.selectedPaths).sort()).toEqual(["b", "c", "d"])
  })

  it("range hacia atrás también funciona", () => {
    const { result } = renderHook(() => useSelection())
    act(() => result.current.select("d", "replace", entries))
    act(() => result.current.select("b", "range", entries))
    expect(Array.from(result.current.selectedPaths).sort()).toEqual(["b", "c", "d"])
  })

  it("clear vacía selección y anchor", () => {
    const { result } = renderHook(() => useSelection())
    act(() => result.current.select("a", "replace", entries))
    act(() => result.current.clear())
    expect(result.current.selectedPaths.size).toBe(0)
    expect(result.current.anchorPath).toBe(null)
  })

  it("selectAll agrega todos", () => {
    const { result } = renderHook(() => useSelection())
    act(() => result.current.selectAll(["a", "b", "c"]))
    expect(result.current.selectedPaths.size).toBe(3)
    expect(result.current.anchorPath).toBe("c")
  })

  it("replace(null) limpia", () => {
    const { result } = renderHook(() => useSelection())
    act(() => result.current.select("a", "replace", entries))
    act(() => result.current.replace(null))
    expect(result.current.selectedPaths.size).toBe(0)
  })

  it("replace con path válido selecciona uno y setea anchor", () => {
    const { result } = renderHook(() => useSelection())
    act(() => result.current.replace("c"))
    expect(Array.from(result.current.selectedPaths)).toEqual(["c"])
    expect(result.current.anchorPath).toBe("c")
  })

  it("add agrega sin quitar selección previa", () => {
    const { result } = renderHook(() => useSelection())
    act(() => result.current.select("a", "replace", entries))
    act(() => result.current.add("c"))
    expect(result.current.selectedPaths.size).toBe(2)
    expect(result.current.isSelected("a")).toBe(true)
    expect(result.current.isSelected("c")).toBe(true)
    expect(result.current.anchorPath).toBe("c")
  })

  it("add idempotente si path ya está", () => {
    const { result } = renderHook(() => useSelection())
    act(() => result.current.select("b", "replace", entries))
    act(() => result.current.add("b"))
    expect(result.current.selectedPaths.size).toBe(1)
  })

  it("remove quita path sin afectar el resto", () => {
    const { result } = renderHook(() => useSelection())
    act(() => result.current.selectAll(["a", "b", "c"]))
    act(() => result.current.remove("b"))
    expect(result.current.selectedPaths.size).toBe(2)
    expect(result.current.isSelected("b")).toBe(false)
    expect(result.current.isSelected("a")).toBe(true)
    expect(result.current.isSelected("c")).toBe(true)
  })

  it("remove en path inexistente no rompe", () => {
    const { result } = renderHook(() => useSelection())
    act(() => result.current.select("a", "replace", entries))
    act(() => result.current.remove("z"))
    expect(result.current.selectedPaths.size).toBe(1)
  })

  it("selectAll vacío limpia selección y anchor", () => {
    const { result } = renderHook(() => useSelection())
    act(() => result.current.selectAll(["a", "b"]))
    act(() => result.current.selectAll([]))
    expect(result.current.selectedPaths.size).toBe(0)
    expect(result.current.anchorPath).toBe(null)
  })

  it("range con anchor fuera de lista hace replace", () => {
    const { result } = renderHook(() => useSelection())
    // anchor fuera de la lista ordenada → fallback a replace
    act(() => result.current.replace("z"))
    act(() => result.current.select("b", "range", entries))
    expect(Array.from(result.current.selectedPaths)).toEqual(["b"])
    expect(result.current.anchorPath).toBe("b")
  })
})
