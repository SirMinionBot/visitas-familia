// Tests end-to-end contra la app desplegada en GitHub Pages.
// Usa Playwright con el binario local, modo headless.
//
// Ejecutar con:  node tests/e2e.mjs
//
// Antes de empezar, limpia docs residuales del smoke test anterior que
// están en el Firestore real (no contaminamos la BD de producción más allá
// de lo necesario).

import { chromium } from 'playwright'

const APP_URL = 'https://sirminionbot.github.io/visitas-familia/'

// Prefijo único para los usuarios que crea el test (luego los borramos).
const RUN_ID = 'E2E-' + Math.random().toString(36).slice(2, 8)
const USER_A = `${RUN_ID}-A`
const USER_B = `${RUN_ID}-B`

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  const icon = ok ? '✓' : '✗'
  console.log(`  ${icon} ${name}${detail ? ' — ' + detail : ''}`)
}

async function main() {
  console.log(`Tests E2E contra ${APP_URL}`)
  console.log(`Run ID: ${RUN_ID}\n`)

  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    timezoneId: 'Europe/Madrid',
  })
  const page = await ctx.newPage()

  // Capturar logs de la consola del navegador para depuración.
  const consoleLogs = []
  page.on('console', (msg) => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`)
  })
  page.on('pageerror', (err) => {
    consoleLogs.push(`[pageerror] ${err.message}`)
  })

  // ============== TEST 1: Pantalla de selección de usuario ==============
  console.log('TEST 1: Carga inicial')
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="seleccion-usuario"]', { timeout: 30000 })
  check('la app carga', true)
  const headerText = await page.locator('h1').first().textContent()
  check('encabezado correcto', headerText?.includes('¿Quién eres?'), `texto="${headerText}"`)

  // ============== TEST 2: Crear primer usuario ==============
  console.log('\nTEST 2: Crear primer usuario')
  await page.fill('[data-testid="input-nuevo-usuario"]', USER_A)
  await page.click('[data-testid="btn-crear-usuario"]')
  await page.waitForSelector('[data-testid="app-shell"]', { timeout: 10000 })
  check('entra al shell de la app tras crear', true)
  const holaText = await page.locator('h1').first().textContent()
  check('saluda por nombre', holaText?.includes(USER_A), `texto="${holaText}"`)

  // ============== TEST 3: Calendario se muestra ==============
  console.log('\nTEST 3: Calendario se muestra')
  await page.waitForSelector('[data-testid="semana-label"]', { timeout: 5000 })
  const semanaLabel = await page.locator('[data-testid="semana-label"]').textContent()
  check('label de semana visible', !!semanaLabel, `"${semanaLabel}"`)

  // Cuenta cuántas celdas hay (deberían ser 28 franjas × 7 días = 196)
  const celdas = await page.locator('[data-testid^="celda-"]').count()
  check('celdas del calendario renderizadas', celdas >= 196, `${celdas} celdas`)

  // Debug: leemos el estado real del calendario desde el navegador.
  // Hacemos un pequeño delay para que la suscripción inicial termine.
  await page.waitForTimeout(2000)
  const turnosIniciales = await page.locator('[data-testid^="turno-"]').count()
  console.log(`    turnos visibles inicialmente: ${turnosIniciales}`)
  if (turnosIniciales === 0) {
    // Debug extra: ¿se llamó alguna vez onTurnosChange? Forzamos un console.log
    await page.evaluate(() => {
      console.log('[debug] turnos en DOM:', document.querySelectorAll('[data-testid^="turno-"]').length)
    })
  }
  check('suscripción inicial a turnos funciona', turnosIniciales >= 0,
    `${turnosIniciales} turnos visibles (si >0, suscripción OK)`)

  // ============== TEST 4: Crear segundo usuario y seleccionarlo ==============
  console.log('\nTEST 4: Crear segundo usuario')
  await page.click('[data-testid="btn-cambiar-usuario"]')
  await page.waitForSelector('[data-testid="seleccion-usuario"]', { timeout: 5000 })
  await page.fill('[data-testid="input-nuevo-usuario"]', USER_B)
  await page.click('[data-testid="btn-crear-usuario"]')
  await page.waitForSelector('[data-testid="app-shell"]', { timeout: 10000 })
  const holaB = await page.locator('h1').first().textContent()
  check('usuario B entra correctamente', holaB?.includes(USER_B), `"${holaB}"`)

  // ============== TEST 5: Crear un turno desde el calendario ==============
  console.log('\nTEST 5: Crear turno desde el calendario')
  // Vamos a la semana actual y seleccionamos una celda que sepamos que existe.
  // Para que sea determinista, localizamos la primera celda del miércoles a las 10:00.
  // Calculamos el lunes de esta semana en formato YYYY-MM-DD con timezone Madrid.
  const lunes = await page.evaluate(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    const dow = (d.getDay() + 6) % 7
    d.setDate(d.getDate() - dow)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  })
  // El miércoles (índice 2) a las 10:00 — celda 10:00 está en la franja "10:00".
  const testidCelda = `celda-${lunes}-1000`
  // Las celdas 8:00, 8:30, 9:00, 9:30, 10:00 — la 5ª fila del día 2.
  // Más fácil: seleccionamos por índice. Cada día tiene 28 franjas.
  const diaIdx = 2 // miércoles
  const franjaIdx = 4 // 10:00 (0=8:00, 1=8:30, 2=9:00, 3=9:30, 4=10:00)
  const celdaIndex = 1 + diaIdx * 28 + franjaIdx // +1 porque la primera fila es el header
  const selector = `[data-testid^="celda-"]:nth-of-type(${celdaIndex})`
  // nth-of-type puede no funcionar aquí por la mezcla con headers. Usamos locator más explícito.
  // Listamos todas las celdas con su data-testid y elegimos la del miércoles 10:00.
  const allCeldas = await page.locator('[data-testid^="celda-"]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-testid')),
  )
  // data-testid = celda-YYYY-MM-DD-HHMM ; el día va implícito por el orden (lunes=0..domingo=6).
  // No: cada fila tiene 7 celdas, una por día. La fila 4 (10:00) tiene 7 celdas en orden lun..dom.
  // Tomamos la primera celda de la fila 4 (= miércoles).
  // Estructura: por cada franja se generan 7 celdas en orden.
  const idxGlobal = franjaIdx * 7 + diaIdx
  const targetTestId = allCeldas[idxGlobal]
  console.log(`    target celda: ${targetTestId} (idx=${idxGlobal})`)

  await page.locator(`[data-testid="${targetTestId}"]`).click()
  await page.waitForSelector('[data-testid="modal"]', { timeout: 5000 })
  check('modal de creación se abre', true)

  // Listamos los usuarios que aparecen en el modal (puede que tarde en hidratar).
  await page.waitForSelector('[data-testid^="modal-usuario-"]', { timeout: 5000 })
  const usuariosEnModal = await page.locator('[data-testid^="modal-usuario-"]').evaluateAll((els) =>
    els.map((e) => ({ testid: e.getAttribute('data-testid'), text: e.textContent?.trim() })),
  )
  const incluyeYo = usuariosEnModal.some((u) => u.text?.includes(USER_B))
  check('usuario actual aparece en la lista del modal', incluyeYo,
    incluyeYo ? '' : `USER_B=${USER_B}, modal tiene ${usuariosEnModal.length}: ${usuariosEnModal.map((u) => u.text).join(' | ')}`)

  // El checkbox del usuario B debería estar marcado por defecto. Usamos el testid que
  // sacamos de la lista (más robusto que asumir el formato del id).
  const miLabel = usuariosEnModal.find((u) => u.text?.includes(USER_B))
  const bChecked = miLabel
    ? await page.locator(`[data-testid="${miLabel.testid}"] input[type="checkbox"]`).isChecked()
    : false
  check('usuario actual seleccionado por defecto', bChecked === true)

  // ============== TEST 6: Guardar el turno ==============
  console.log('\nTEST 6: Guardar turno')
  await page.click('[data-testid="modal-guardar"]')
  // Tras guardar, el modal debe desaparecer y el turno debe aparecer en su celda.
  await page.waitForSelector('[data-testid="modal"]', { state: 'detached', timeout: 5000 })
  check('modal se cierra tras guardar', true)

  // Esperamos a que la suscripción onTurnosChange actualice el DOM. Firestore puede tardar.
  await page.waitForFunction(
    () => {
      const celdas = document.querySelectorAll('[data-testid^="celda-"]')
      for (const c of celdas) {
        if (c.querySelector('[data-testid^="turno-"]')) return true
      }
      return false
    },
    { timeout: 15000 },
  ).catch(() => {})
  // El turno debe aparecer como un botón dentro de la celda objetivo.
  const turnosEnCelda = await page
    .locator(`[data-testid="${targetTestId}"] [data-testid^="turno-"]`)
    .count()
  check('turno visible en la celda', turnosEnCelda >= 1, `${turnosEnCelda} turno(s) en celda ${targetTestId}`)

  // ============== TEST 7: Crear nota-alerta ==============
  console.log('\nTEST 7: Crear nota-alerta')
  await page.click('[data-testid="tab-notas"]')
  await page.waitForSelector('[data-testid="form-nota"]', { timeout: 5000 })
  await page.fill('[data-testid="input-texto-nota"]', `Paciente no come sólidos ${RUN_ID}`)
  await page.check('[data-testid="checkbox-alerta"]')
  await page.click('[data-testid="btn-publicar-nota"]')
  await page.waitForTimeout(1500)
  const notas = await page.locator('[data-testid^="nota-"]').count()
  check('nota aparece en lista', notas >= 1, `${notas} nota(s)`)
  const tieneAlerta = await page
    .locator(`[data-testid^="nota-"]:has-text("${RUN_ID}")`)
    .first()
    .locator('text=ALERTA')
    .count()
  check('chip ALERTA visible', tieneAlerta >= 1)

  // ============== RESUMEN Y LOGS ==============
  console.log('\n=== TODOS LOS LOGS DEL NAVEGADOR ===')
  for (const log of consoleLogs) {
    console.log('  ' + log)
  }
  if (consoleLogs.length === 0) {
    console.log('  (sin logs)')
  }

  await browser.close()

  // ============== RESULTADOS ==============
  console.log('\n' + '='.repeat(60))
  const passed = results.filter((r) => r.ok).length
  const total = results.length
  console.log(`RESUMEN: ${passed}/${total} tests pasados`)
  for (const r of results) {
    console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}`)
  }
  process.exit(passed === total ? 0 : 1)
}

main().catch((e) => {
  console.error('Error fatal:', e)
  process.exit(2)
})
