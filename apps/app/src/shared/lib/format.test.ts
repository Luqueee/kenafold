import { describe, it, expect } from "vitest"
import { formatSize, formatDate } from "./format"

describe("formatSize", () => {
  it("retorna em-dash para 0", () => {
    expect(formatSize(0)).toBe("—")
  })

  it("formatea bytes", () => {
    expect(formatSize(512)).toBe("512.0 B")
  })

  it("formatea KB", () => {
    expect(formatSize(2048)).toBe("2.0 KB")
  })

  it("formatea MB", () => {
    expect(formatSize(5 * 1024 * 1024)).toBe("5.0 MB")
  })

  it("formatea GB", () => {
    expect(formatSize(3 * 1024 ** 3)).toBe("3.0 GB")
  })
})

describe("formatDate", () => {
  it("retorna em-dash para 0", () => {
    expect(formatDate(0)).toBe("—")
  })

  it("retorna string no vacío para timestamp válido", () => {
    expect(formatDate(1700000000)).not.toBe("—")
    expect(formatDate(1700000000).length).toBeGreaterThan(0)
  })
})
