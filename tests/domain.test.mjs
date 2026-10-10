import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'

const compile = path => ts.transpileModule(fs.readFileSync(path, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText
const asUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
const domainUrl = asUrl(compile(new URL('../src/domain.ts', import.meta.url)))
const d = await import(domainUrl)
const seed = JSON.parse(fs.readFileSync(new URL('../src/data/seed.json', import.meta.url), 'utf8'))
const rows = [['', ...d.HEADERS], ...seed.leads.map(l => ['', ...d.FIELDS.map(f => l[f] || '')])]
const storage = new Map()
const legacyKey = ['yili', 'opportunity', 'prototype', 'v1'].join('-')
storage.set(legacyKey, JSON.stringify({ leads: [{ title: 'legacy isolation sentinel' }], tasks: [], people: [], accounts: [], rules: [], imports: [] }))
storage.set(`${legacyKey}-account`, 'LEGACY')
globalThis.localStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }
globalThis.window = new EventTarget()
let storeCode = compile(new URL('../src/store.ts', import.meta.url))
storeCode = storeCode.replace(/from 'vue'/g, `from '${import.meta.resolve('vue')}'`)
  .replace(/from 'xlsx'/g, `from '${import.meta.resolve('xlsx')}'`)
  .replace(/import seed from '\.\/data\/seed\.json';/, `const seed = ${JSON.stringify(seed)};`)
  .replace(/from '\.\/domain'/g, `from '${domainUrl}'`)
const { useStore } = await import(asUrl(storeCode))
const s = useStore()
function reset() { s.switchAccount('SYS1'); s.reset() }

test('public snapshot ignores legacy local storage and storage events', () => {
  assert.equal(s.account.id, 'SYS1')
  assert.equal(s.state.leads.length, 21)
  assert.ok(s.state.leads.every(l => l.title.startsWith('虚构')))
  const event = new Event('storage')
  Object.assign(event, { key: legacyKey, newValue: storage.get(legacyKey) })
  window.dispatchEvent(event)
  assert.equal(s.state.leads.length, 21)
  assert.equal(storage.get(`${legacyKey}-account`), 'LEGACY')
})

test('Pages project base, hash routing and embedded links remain deployment-safe', () => {
  const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
  assert.match(read('../vite.config.ts'), /base:\s*'\/YL-Dispatch\/'/)
  assert.match(read('../src/main.ts'), /createWebHashHistory\(import\.meta\.env\.BASE_URL\)/)
  const desktop = read('../src/views/Desktop.vue')
  assert.equal((desktop.match(/:href="router\.resolve\('\/h5'\)\.href"/g) || []).length, 2)
  assert.match(desktop, /:src="router\.resolve\('\/h5'\)\.href"/)
  assert.doesNotMatch(desktop, /(?:href|src)="\/(?:h5|overview)"/)
  assert.match(read('../src/views/Mobile.vue'), /route\.query\.account/)
  assert.match(read('../src/App.vue'), /全部线索、组织、人员及业务结果均为虚构/)
})

test('fictional public dataset includes 25 samples, 21 valid rows and 4 deliberate failures', () => {
  const result = d.validateRows(rows, [], d.DEFAULT_RULES, '2026-10-10')
  assert.equal(seed.sheet, '虚构演示线索')
  assert.equal(seed.source, '公开演示线索（全部虚构）.xlsx')
  assert.equal(seed.leads.length, 25)
  assert.equal(result.valid.length, 21)
  assert.equal(result.errors.length, 4)
  assert.deepEqual(result.errors.map(e => e.row), [23, 24, 25, 26])
  assert.equal(s.state.leads.find(l => l.id === 'L017').serial, '17')
  for (const lead of seed.leads) {
    for (const field of ['buyer', 'budget', 'channel', 'ratingReason', 'summary']) assert.match(lead[field], /虚构/)
    assert.ok(!lead.title || lead.title.startsWith('虚构'))
    assert.match(lead.bidNumber, /^FICTION-(BID|INVALID)-\d{3}$/)
    assert.equal(lead.contact, '演示联系人，无真实联系方式')
    assert.doesNotMatch(Object.values(lead).join(' '), /(?:https?:\/\/|www\.|\b1\d{10}\b|[\w.+-]+@[\w.-]+\.[a-z]{2,})/i)
  }
  assert.equal(s.state.people.length, 12)
  assert.equal(s.state.accounts.filter(a => a.role === 'sys').length, 3)
  assert.equal(s.state.accounts.filter(a => a.role === 'ops').length, 7)
  assert.ok(s.state.people.every(p => p.phone === '演示联系人，无真实联系方式' && p.name.startsWith('演示销售') && p.entity.startsWith('虚构')))
})
test('header B, Excel dates, field validation and duplicate signatures', () => {
  const one = rows[1]
  assert.equal(d.normalizeDate(46303), '2026-10-08')
  assert.equal(d.normalizeDate('2026年10月09日09时30分'), '2026-10-09')
  assert.equal(d.normalizeDate('2026-02-30'), '')
  const result = d.validateRows([rows[0], one, one], [], d.DEFAULT_RULES, '2026-10-10')
  assert.equal(result.valid.length, 1)
  assert.match(result.errors[0].reason, /重复/)
  assert.equal(d.validateRows(rows, s.state.leads, d.DEFAULT_RULES, s.now).valid.length, 0)
})
test('transparent mappings and simultaneous category plus region match', () => {
  assert.deepEqual(d.mapCategories('常温奶,酸奶及益生菌', d.DEFAULT_RULES), ['液态奶', '冷藏'])
  assert.deepEqual(d.mapCategories('', d.DEFAULT_RULES), ['待确认'])
  assert.deepEqual(d.mapCategories('未知品类', d.DEFAULT_RULES), ['待确认'])
  const lead = s.state.leads[0]
  const person = s.state.people[0]
  assert.equal(d.eligibleSales(lead, person), true)
  assert.equal(d.eligibleSales(lead, { ...person, categories: ['冷饮'] }), false)
  assert.equal(d.eligibleSales(lead, { ...person, segments: ['浙江'] }), false)
  assert.equal(d.eligibleSales(lead, { ...person, enabled: false }), false)
  assert.equal(d.regionMatches('新疆-阿勒泰地...', { ...person, segments: ['新疆'] }), false)
})
test('ABC auto only, multi-sales and repeat-auto idempotence', () => {
  reset()
  assert.equal(s.state.leads.length, 21)
  assert.equal(s.state.imports[0].total, 25)
  assert.equal(s.state.imports[0].failed, 4)
  assert.ok(s.state.tasks.every(t => ['A', 'B', 'C'].includes(s.state.leads.find(l => l.id === t.leadId).rating)))
  assert.equal(s.leadTasks('L001').length, 2)
  assert.deepEqual(s.leadTasks('L001').map(t => t.salesId), ['P01', 'P02'])
  assert.deepEqual(s.leadTasks('L002').map(t => t.salesId), ['P03'])
  assert.deepEqual(s.leadTasks('L004').map(t => t.salesId), ['P04', 'P05'])
  assert.deepEqual([...s.getLead('L004').categories], ['液态奶', '冷藏'])
  assert.match(s.state.leads.find(l => l.id === 'L003').pendingReason, /自动派发失败/)
  assert.equal(s.autoDispatch(), 0)
})
test('ops category permissions and sys-only mutation guards', () => {
  reset()
  s.switchAccount('OPS2')
  assert.ok(s.visibleLeads.every(l => l.categories.includes('冷饮')))
  assert.throws(() => s.assign(['L001'], ['P01']), /无权/)
  assert.throws(() => s.autoDispatch(), /系统管理员/)
  assert.throws(() => s.saveRules([]), /系统管理员/)
  assert.throws(() => s.importRows(rows, 'test.xlsx'), /系统管理员/)
  s.switchAccount('SYS1')
  s.saveGrants('OPS2', ['液态奶'])
  s.switchAccount('OPS2')
  assert.ok(s.visibleLeads.some(l => l.id === 'L001'))
})
test('manual dispatch any rating, multiple sales, duplicate active prevention, atomic batch', () => {
  reset()
  assert.equal(s.assign(['L005', 'L012'], ['P01', 'P02']), 4)
  assert.throws(() => s.assign(['L005'], ['P01', 'P01']), /重复/)
  const count = s.state.tasks.length
  assert.throws(() => s.assign(['L006', 'L005'], ['P01']), /进行中/)
  assert.equal(s.state.tasks.length, count)
  assert.equal(s.leadTasks('L006').length, 0)
})
test('reject retains other sales tasks, returns pending, can manually reassign former reject', () => {
  reset()
  s.switchAccount('SALES-P02')
  const task = s.myTasks.find(t => t.leadId === 'L001')
  assert.throws(() => s.respond(task.id, false, ''), /原因/)
  s.respond(task.id, false, '模拟运力不足')
  s.switchAccount('SYS1')
  assert.equal(s.leadTasks('L001').length, 2)
  assert.equal(s.leadStatus(s.getLead('L001')), '待派发')
  assert.equal(s.autoDispatch(), 0)
  assert.equal(s.assign(['L001'], ['P02']), 1)
})
test('sales access isolation, accept followup and multi-order winning rules', () => {
  reset()
  s.switchAccount('SALES-P02')
  assert.equal(s.visibleLeads.length, 0)
  assert.equal(s.getLead('L002'), undefined)
  const task = s.myTasks.find(t => t.leadId === 'L001')
  const other = s.state.tasks.find(t => t.salesId === 'P03')
  assert.throws(() => s.feedback(other.id, '跟进中', '', []), /本人/)
  assert.throws(() => s.feedback(task.id, '中标', '', ['SO1']), /先接收/)
  s.respond(task.id, true, '')
  s.feedback(task.id, '还在沟通', '模拟沟通记录', [])
  assert.throws(() => s.feedback(task.id, '中标', '', []), /订单号/)
  assert.throws(() => s.feedback(task.id, '中标', '', ['SO1', 'SO1']), /重复/)
  s.feedback(task.id, '中标', '模拟签约', ['SO1', 'SO2'])
  assert.deepEqual([...task.orders], ['SO1', 'SO2'])
  assert.ok(task.events.length >= 4)
})
test('recent-month blank pool, independent claims, duplicate claim blocked', () => {
  reset()
  s.switchAccount('SALES-P08')
  assert.equal(s.pool.length, 10)
  assert.ok(s.pool.every(l => !l.rating))
  assert.equal(d.inRecentMonth({ ...s.pool[0], publishedAt: '2026-09-09' }, s.now), false)
  assert.equal(d.inRecentMonth({ ...s.pool[0], publishedAt: '2026-10-11' }, s.now), false)
  const task = s.claim('L012')
  assert.equal(task.source, 'claim')
  assert.equal(task.status, '跟进中')
  assert.equal(s.myClaims.length, 1)
  assert.ok(!s.myTasks.includes(task))
  assert.throws(() => s.claim('L012'), /已认领/)
  s.feedback(task.id, '已放弃', '模拟退出', [])
  assert.throws(() => s.claim('L012'), /已认领/)
})
test('local persistence and account storage update', () => {
  reset()
  const snapshot = JSON.parse(storage.get('yili-public-demo-v1'))
  assert.equal(snapshot.leads.length, 21)
  s.switchAccount('OPS1')
  assert.equal(storage.get('yili-public-demo-v1-account'), 'OPS1')
  reset()
})
test('import commits valid rows immediately and routes unmapped ABC to operations', () => {
  reset()
  const row = [...rows[1]]
  row[2] = '虚构自动派发失败测试 · 合成验证'
  row[8] = 'FICTION-IMPORT-001'
  row[5] = '上海-浦东'
  row[6] = '未映射类别'
  const record = s.importRows([rows[0], row, row], '合成验证.xlsx')
  assert.equal(record.total, 2)
  assert.equal(record.valid, 1)
  assert.equal(record.failed, 1)
  assert.equal(record.auto, 0)
  assert.equal(record.todo, 1)
  const lead = s.state.leads[0]
  assert.deepEqual([...lead.categories], ['待确认'])
  assert.match(lead.pendingReason, /自动派发失败/)
  s.switchAccount('OPS7')
  assert.ok(s.visibleLeads.some(l => l.id === lead.id))
  reset()
})
test('personnel edits update sales identity and disable automatic and manual eligibility', () => {
  reset()
  const person = { ...s.state.people[0], categories: ['液态奶'], segments: ['云南'], enabled: false }
  s.savePerson(person)
  assert.ok(!s.salesAccounts.some(a => a.personId === person.id))
  assert.throws(() => s.switchAccount('SALES-P01'), /停用/)
  assert.throws(() => s.assign(['L005'], ['P01']), /停用/)
  assert.throws(() => s.savePerson({ ...person, wecomId: s.state.people[1].wecomId }), /唯一标识/)
  assert.throws(() => s.savePerson({ ...person, phone: '不可使用的联系字段' }), /固定联系说明/)
  reset()
})
test('storage events apply shared data and identity without echoing mutations', () => {
  reset()
  const snapshot = JSON.parse(JSON.stringify(s.state))
  snapshot.leads[0].pendingReason = '跨窗口同步验证'
  const event = new Event('storage')
  Object.assign(event, { key: 'yili-public-demo-v1', newValue: JSON.stringify(snapshot) })
  storage.set(event.key, event.newValue)
  window.dispatchEvent(event)
  assert.equal(s.state.leads[0].pendingReason, '跨窗口同步验证')
  const accountEvent = new Event('storage')
  Object.assign(accountEvent, { key: 'yili-public-demo-v1-account', newValue: 'OPS7' })
  window.dispatchEvent(accountEvent)
  assert.equal(s.account.id, 'OPS7')
  reset()
})

test('blocked browser storage retains usable fictional in-memory state and identity', async () => {
  const savedStorage = globalThis.localStorage
  globalThis.localStorage = {
    getItem() { throw new DOMException('Blocked', 'SecurityError') },
    setItem() { throw new DOMException('Blocked', 'SecurityError') },
  }
  try {
    const isolated = (await import(asUrl(`${storeCode}\n// blocked-storage instance`))).useStore()
    assert.equal(isolated.account.id, 'SYS1')
    assert.equal(isolated.state.leads.length, 21)
    isolated.switchAccount('OPS2')
    assert.equal(isolated.account.id, 'OPS2')
    isolated.switchAccount('SYS1')
    isolated.reset()
    assert.equal(isolated.state.leads.length, 21)
  } finally { globalThis.localStorage = savedStorage }
})
