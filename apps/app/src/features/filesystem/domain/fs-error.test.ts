import { describe, it, expect } from "vitest"
import { classifyFsError, fsErrorMessage } from "./fs-error"

describe("classifyFsError", () => {
  it("clasifica permission denied", () => {
    expect(classifyFsError("Permission denied").kind).toBe("PermissionDenied")
    expect(classifyFsError("EACCES: access").kind).toBe("PermissionDenied")
    expect(classifyFsError("operation not permitted").kind).toBe("PermissionDenied")
  })

  it("clasifica not found", () => {
    expect(classifyFsError("No such file").kind).toBe("NotFound")
    expect(classifyFsError("ENOENT").kind).toBe("NotFound")
  })

  it("clasifica already exists", () => {
    expect(classifyFsError("File exists").kind).toBe("AlreadyExists")
    expect(classifyFsError("EEXIST").kind).toBe("AlreadyExists")
  })

  it("clasifica no space", () => {
    expect(classifyFsError("No space left").kind).toBe("NoSpace")
    expect(classifyFsError("ENOSPC").kind).toBe("NoSpace")
  })

  it("clasifica invalid name", () => {
    expect(classifyFsError("Nombre inválido").kind).toBe("InvalidName")
    expect(classifyFsError("Nombre vacío").kind).toBe("InvalidName")
  })

  it("clasifica path escape", () => {
    expect(classifyFsError("Path escapa del directorio permitido").kind).toBe("PathEscape")
    expect(classifyFsError("Padre inaccesible: foo").kind).toBe("PathEscape")
  })

  it("clasifica network errors", () => {
    expect(classifyFsError("Connection refused").kind).toBe("NetworkError")
    expect(classifyFsError("ETIMEDOUT").kind).toBe("NetworkError")
  })

  it("retorna Unknown para mensajes ambiguos", () => {
    expect(classifyFsError("zalgo").kind).toBe("Unknown")
  })

  it("acepta Error objects", () => {
    expect(classifyFsError(new Error("ENOENT")).kind).toBe("NotFound")
  })
})

describe("fsErrorMessage", () => {
  it("retorna mensaje localizado para errores conocidos", () => {
    expect(fsErrorMessage("ENOENT")).toBe("Archivo o directorio no encontrado")
    expect(fsErrorMessage("Permission denied")).toBe("Permiso denegado")
  })

  it("retorna raw para Unknown", () => {
    expect(fsErrorMessage("zalgo comes")).toBe("zalgo comes")
  })
})
