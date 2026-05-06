import { describe, it, expect, vi } from "vitest"
import { render } from "@testing-library/react"
import { DndContext } from "@dnd-kit/core"
import { FileTile } from "./file-tile"
import type { FileEntry } from "@/features/filesystem/domain/file-entry"

const makeEntry = (overrides: Partial<FileEntry> = {}): FileEntry => ({
  name: "photo.png",
  path: "/home/user/photo.png",
  is_dir: false,
  size: 4096,
  modified: 1_700_000_000,
  extension: "png",
  ...overrides,
})

const defaultProps = {
  isSelected: false,
  isCut: false,
  isRenaming: false,
  onClick: vi.fn(),
  onDoubleClick: vi.fn(),
  onContextMenu: vi.fn(),
}

function renderTile(props: Partial<typeof defaultProps> & { entry?: FileEntry } = {}) {
  const { entry = makeEntry(), ...rest } = props
  return render(
    <DndContext>
      <FileTile entry={entry} {...defaultProps} {...rest}>
        <span>icon</span>
        <span>{entry.name}</span>
      </FileTile>
    </DndContext>,
  )
}

describe("FileTile snapshots", () => {
  it("renders file in default state", () => {
    const { container } = renderTile()
    expect(container.querySelector("[role='button']")).toMatchSnapshot()
  })

  it("renders file in selected state", () => {
    const { container } = renderTile({ isSelected: true })
    expect(container.querySelector("[role='button']")).toMatchSnapshot()
  })

  it("renders file in cut state", () => {
    const { container } = renderTile({ isCut: true })
    expect(container.querySelector("[role='button']")).toMatchSnapshot()
  })

  it("renders folder (drop target enabled)", () => {
    const { container } = renderTile({
      entry: makeEntry({ is_dir: true, name: "Downloads", path: "/home/user/Downloads", extension: null }),
    })
    expect(container.querySelector("[role='button']")).toMatchSnapshot()
  })

  it("aria-pressed reflects selection state", () => {
    const { container } = renderTile({ isSelected: true })
    const tile = container.querySelector("[role='button']")
    expect(tile?.getAttribute("aria-pressed")).toBe("true")
  })

  it("aria-label identifies file type", () => {
    const { container } = renderTile()
    const tile = container.querySelector("[role='button']")
    expect(tile?.getAttribute("aria-label")).toContain("Archivo")
    expect(tile?.getAttribute("aria-label")).toContain("photo.png")
  })

  it("aria-label identifies folder type", () => {
    const { container } = renderTile({
      entry: makeEntry({ is_dir: true, name: "Music" }),
    })
    const tile = container.querySelector("[role='button']")
    expect(tile?.getAttribute("aria-label")).toContain("Carpeta")
  })

  it("tabIndex is 0 when selected, -1 otherwise", () => {
    const { container: sel } = renderTile({ isSelected: true })
    const { container: noSel } = renderTile({ isSelected: false })
    expect(sel.querySelector("[role='button']")?.getAttribute("tabindex")).toBe("0")
    expect(noSel.querySelector("[role='button']")?.getAttribute("tabindex")).toBe("-1")
  })
})
