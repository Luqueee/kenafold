import { describe, it, expect, vi } from "vitest"
import { render } from "@testing-library/react"
import { DndContext } from "@dnd-kit/core"
import { FileRow } from "./file-row"
import type { FileEntry } from "@/features/filesystem/domain/file-entry"

const makeEntry = (overrides: Partial<FileEntry> = {}): FileEntry => ({
  name: "document.txt",
  path: "/home/user/document.txt",
  is_dir: false,
  size: 2048,
  modified: 1_700_000_000,
  extension: "txt",
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

function renderRow(props: Partial<typeof defaultProps> & { entry?: FileEntry } = {}) {
  const { entry = makeEntry(), ...rest } = props
  return render(
    <DndContext>
      <table>
        <tbody>
          <FileRow entry={entry} {...defaultProps} {...rest}>
            <td>col1</td>
            <td>col2</td>
          </FileRow>
        </tbody>
      </table>
    </DndContext>,
  )
}

describe("FileRow snapshots", () => {
  it("renders file in default state", () => {
    const { container } = renderRow()
    expect(container.querySelector("tr")).toMatchSnapshot()
  })

  it("renders file in selected state", () => {
    const { container } = renderRow({ isSelected: true })
    expect(container.querySelector("tr")).toMatchSnapshot()
  })

  it("renders file in cut state", () => {
    const { container } = renderRow({ isCut: true })
    expect(container.querySelector("tr")).toMatchSnapshot()
  })

  it("renders folder (drop target enabled)", () => {
    const { container } = renderRow({ entry: makeEntry({ is_dir: true, name: "Documents", path: "/home/user/Documents", extension: null }) })
    expect(container.querySelector("tr")).toMatchSnapshot()
  })

  it("aria-selected reflects selection state", () => {
    const { container } = renderRow({ isSelected: true })
    const row = container.querySelector("tr")
    expect(row?.getAttribute("aria-selected")).toBe("true")
  })

  it("aria-label identifies file type", () => {
    const { container } = renderRow()
    const row = container.querySelector("tr")
    expect(row?.getAttribute("aria-label")).toContain("Archivo")
    expect(row?.getAttribute("aria-label")).toContain("document.txt")
  })

  it("aria-label identifies folder type", () => {
    const { container } = renderRow({ entry: makeEntry({ is_dir: true, name: "Photos" }) })
    const row = container.querySelector("tr")
    expect(row?.getAttribute("aria-label")).toContain("Carpeta")
  })
})
