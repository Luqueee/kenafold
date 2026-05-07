/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect, HOME, HOME_ENTRIES, DOCUMENTS_ENTRIES } from "./fixtures"

// ─────────────────────────────────────────────────────────────────────────────
// Flow 1: Navegar
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Navegar", () => {
  test("muestra el contenido del home al iniciar", async ({ mockedPage }) => {
    for (const entry of HOME_ENTRIES) {
      await expect(
        mockedPage.locator(`tr[data-path="${entry.path}"]`)
      ).toBeVisible()
    }
  })

  test("navega a una subcarpeta al hacer doble clic", async ({
    mockedPage,
  }) => {
    const documentsRow = mockedPage.locator(`tr[data-path="${HOME}/Documents"]`)
    await documentsRow.dblclick()

    // Los archivos de la carpeta Documents deben aparecer.
    for (const entry of DOCUMENTS_ENTRIES) {
      await expect(
        mockedPage.locator(`tr[data-path="${entry.path}"]`)
      ).toBeVisible()
    }

    // Los archivos del home ya no deben estar visibles.
    await expect(
      mockedPage.locator(`tr[data-path="${HOME}/archivo.zip"]`)
    ).not.toBeVisible()
  })

  test("vuelve al directorio anterior con el botón Atrás", async ({
    mockedPage,
  }) => {
    // Navegar a Documents.
    await mockedPage.locator(`tr[data-path="${HOME}/Documents"]`).dblclick()
    await expect(
      mockedPage.locator(`tr[data-path="${HOME}/Documents/readme.md"]`)
    ).toBeVisible()

    // Clic en el botón Atrás del toolbar.
    await mockedPage.locator('button[title="Atrás (⌘[)"]').click()

    await expect(
      mockedPage.locator(`tr[data-path="${HOME}/Documents"]`)
    ).toBeVisible({ timeout: 5_000 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Flow 2: Copiar
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Copiar", () => {
  test("copia un archivo al pegar en otro directorio", async ({
    mockedPage,
    getIpcCalls,
  }) => {
    // 1. Abrir context menu sobre notes.txt → Copiar.
    await mockedPage.locator(`tr[data-path="${HOME}/notes.txt"]`).click({ button: "right" })
    await mockedPage.locator('[role="menuitem"]', { hasText: "Copiar" }).first().click()

    // 2. Navegar a Documents con doble clic.
    await mockedPage.locator(`tr[data-path="${HOME}/Documents"]`).dblclick()
    await expect(
      mockedPage.locator(`tr[data-path="${HOME}/Documents/readme.md"]`)
    ).toBeVisible()

    // 3. Abrir context menu sobre readme.md → Pegar (clipboard ya seteado).
    await mockedPage.locator(`tr[data-path="${HOME}/Documents/readme.md"]`).click({ button: "right" })
    await mockedPage.locator('[role="menuitem"]', { hasText: "Pegar" }).click()

    // 4. Verificar que se invocó copy_entry con src y dest correctos.
    const calls = await getIpcCalls()
    const copyCall = calls.find((c) => c.cmd === "copy_entry")
    expect(copyCall).toBeDefined()
    expect((copyCall!.args as any).src).toBe(`${HOME}/notes.txt`)
    expect((copyCall!.args as any).dest).toContain(`${HOME}/Documents`)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Flow 3: Extraer
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Extraer", () => {
  test("descomprime un archivo zip desde el menú contextual", async ({
    mockedPage,
    getIpcCalls,
  }) => {
    const zipRow = mockedPage.locator(`tr[data-path="${HOME}/archivo.zip"]`)
    await expect(zipRow).toBeVisible()

    // Abrir menú contextual.
    await zipRow.click({ button: "right" })

    // Esperar la opción "Descomprimir".
    const decompressItem = mockedPage.locator('[role="menuitem"]', {
      hasText: "Descomprimir",
    })
    await expect(decompressItem).toBeVisible({ timeout: 5_000 })
    await decompressItem.click()

    // Verificar que se invocó decompress_entry con el path correcto.
    const calls = await getIpcCalls()
    const call = calls.find((c) => c.cmd === "decompress_entry")
    expect(call).toBeDefined()
    expect((call!.args as any).path).toBe(`${HOME}/archivo.zip`)
  })

  test("el menú contextual NO muestra Descomprimir para archivos no-archivo", async ({
    mockedPage,
  }) => {
    const txtRow = mockedPage.locator(`tr[data-path="${HOME}/notes.txt"]`)
    await txtRow.click({ button: "right" })

    const decompressItem = mockedPage.locator('[role="menuitem"]', {
      hasText: "Descomprimir",
    })
    await expect(decompressItem).not.toBeVisible({ timeout: 3_000 })

    // Cerrar el menú.
    await mockedPage.keyboard.press("Escape")
  })
})
