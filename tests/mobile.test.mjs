import test, { beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { effectScope } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const asUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
const transpile = code => ts.transpileModule(code, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText
const storage = new Map()
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: key => storage.delete(key),
}
globalThis.window = new EventTarget()
const domainUrl = asUrl(transpile(read('../src/domain.ts')))
const storeUrl = asUrl(transpile(read('../src/store.ts'))
  .replace(/from 'vue'/g, `from '${import.meta.resolve('vue')}'`)
  .replace(/from 'xlsx'/g, `from '${import.meta.resolve('xlsx')}'`)
  .replace(/import seed from '\.\/data\/seed\.json';/, `const seed = ${read('../src/data/seed.json')};`)
  .replace(/from '\.\/domain'/g, `from '${domainUrl}'`) + '\nexport { DemoStore };')
const { useStore, DemoStore } = await import(storeUrl)
const s = useStore()
const vueUrl = asUrl(`export * from '${import.meta.resolve('vue')}'; export const onMounted = () => {};`)
const routerUrl = asUrl('export const useRouter = () => globalThis.__mobileTest.router; export const useRoute = () => ({ query: {} });')
const vantUrl = asUrl(`
  export const ActionSheet = {}, Button = {}, Empty = {}, Field = {}, Icon = {}, Popup = {}, Tab = {}, Tabbar = {}, TabbarItem = {}, Tabs = {}, Tag = {};
  export const closeDialog = () => {}, closeToast = () => {};
  export const showToast = message => globalThis.__mobileTest.toasts.push(message);
  export const showConfirmDialog = () => globalThis.__mobileTest.confirm();
`)
const source = read('../src/views/Mobile.vue')
const { descriptor } = parse(source)
const script = compileScript(descriptor, { id: 'mobile-test' })
const template = compileTemplate({
  source: descriptor.template.content, filename: 'Mobile.vue', id: 'mobile-test',
  compilerOptions: { bindingMetadata: script.bindings },
})
assert.deepEqual(template.errors, [])
const componentUrl = asUrl(transpile(script.content)
  .replace(/import ['"][^'"]+\.css['"];?/g, '')
  .replace(/from ['"]vue['"]/g, `from '${vueUrl}'`)
  .replace(/from ['"]vue-router['"]/g, `from '${routerUrl}'`)
  .replace(/from ['"]vant['"]/g, `from '${vantUrl}'`)
  .replace(/from ['"]\.\.\/store['"]/g, `from '${storeUrl}'`))
const { default: Mobile } = await import(componentUrl)
let scope, vm, router, navigations, toasts

beforeEach(async () => {
  s.switchAccount('SYS1')
  s.reset()
  navigations = []
  toasts = []
  router = createRouter({
    history: createMemoryHistory('/YL-Dispatch/'),
    routes: ['/h5', '/overview'].map(path => ({ path, component: {} })),
  })
  await router.replace('/h5')
  globalThis.__mobileTest = {
    toasts, confirm: () => Promise.resolve(),
    router: { replace: path => {
      navigations.push({ path, role: s.account.role, id: s.account.id })
      return router.replace(path)
    } },
  }
  scope = effectScope()
  vm = scope.run(() => Mobile.setup({}, { expose() {} }))
})
afterEach(() => scope.stop())

test('return controls are wired in header, admin welcome and sales profile without absolute navigation', () => {
  assert.equal((source.match(/@click="returnToDesktop"/g) || []).length, 3)
  assert.match(source, /title="选择管理员身份，返回 PC"/)
  assert.match(source, /@select="switchAdmin"/)
  assert.match(source, /不重置本地记录/)
  assert.doesNotMatch(source, /(?:href="\/|window\.(?:top|parent)|location\.(?:href|assign|replace))/)
  assert.match(read('../src/views/Desktop.vue'), /if \(role === 'sales'\) void router\.replace\('\/h5'\)/)
})

test('sales return opens a separate chooser of actual sys and ops accounts; cancelling preserves identity', async () => {
  vm.switchSales({ accountId: 'SALES-P02' })
  vm.accountSheet.value = true
  await vm.returnToDesktop()
  assert.equal(vm.accountSheet.value, false)
  assert.equal(vm.adminSheet.value, true)
  assert.equal(navigations.length, 0)
  assert.equal(s.account.role, 'sales')
  assert.deepEqual(vm.adminActions.value.map(a => a.accountId),
    s.state.accounts.filter(a => a.role === 'sys' || a.role === 'ops').map(a => a.id))
  assert.ok(vm.accountActions.value.every(a => s.salesAccounts.some(account => account.id === a.accountId)))
  vm.adminSheet.value = false
  assert.equal(s.account.id, 'SALES-P02')
  assert.equal(router.currentRoute.value.path, '/h5')
})

test('every sys and ops selection switches before navigation, retains feedback and grants, and reloads as admin', async () => {
  s.saveGrants('OPS2', ['液态奶'])
  s.switchAccount('SALES-P02')
  const task = s.myTasks.find(t => t.status === '待接收')
  s.respond(task.id, true, '')
  s.feedback(task.id, '中标', '模拟返回 PC 保留验证', ['DEMO-RETURN-001'])
  const snapshot = JSON.stringify(s.state)
  const admins = s.state.accounts.filter(a => a.role === 'sys' || a.role === 'ops')
  for (const account of admins) {
    s.switchAccount('SALES-P02')
    await router.replace('/h5')
    await vm.returnToDesktop()
    vm.detailOpen.value = true
    await vm.switchAdmin({ accountId: account.id })
    assert.deepEqual(navigations.at(-1), { path: '/overview', role: account.role, id: account.id })
    assert.equal(router.currentRoute.value.path, '/overview')
    assert.equal(vm.adminSheet.value, false)
    assert.equal(vm.detailOpen.value, false)
    assert.equal(JSON.stringify(s.state), snapshot)
    const refreshed = new DemoStore()
    assert.equal(refreshed.account.id, account.id)
    assert.equal(refreshed.state.tasks.find(t => t.id === task.id).notes, '模拟返回 PC 保留验证')
    assert.deepEqual([...s.account.categories], [...account.categories])
    if (account.role === 'ops') {
      assert.ok(s.visibleLeads.every(l => l.categories.some(category => account.categories.includes(category))))
      assert.throws(() => s.saveRules([]), /系统管理员/)
    } else {
      assert.equal(s.visibleLeads.length, s.state.leads.length)
      assert.doesNotThrow(() => s.requireSys())
    }
  }
  s.switchAccount('SALES-P02')
  assert.deepEqual([...s.myTasks.find(t => t.id === task.id).orders], ['DEMO-RETURN-001'])
})

test('an existing admin returns directly without changing current account or state', async () => {
  for (const id of ['SYS2', 'OPS2']) {
    s.switchAccount(id)
    const snapshot = JSON.stringify(s.state)
    await vm.returnToDesktop()
    assert.equal(s.account.id, id)
    assert.equal(vm.adminSheet.value, false)
    assert.equal(router.currentRoute.value.path, '/overview')
    assert.equal(JSON.stringify(s.state), snapshot)
  }
})

test('invalid or stale administrator selections show a toast without navigation', async () => {
  s.switchAccount('SALES-P02')
  await vm.returnToDesktop()
  for (const accountId of [undefined, 'MISSING', 'SALES-P01']) {
    await vm.switchAdmin({ accountId })
    assert.equal(s.account.id, 'SALES-P02')
    assert.equal(vm.adminSheet.value, true)
  }
  assert.equal(navigations.length, 0)
  assert.equal(toasts.length, 3)
  assert.ok(toasts.every(message => /有效的模拟管理员/.test(message)))
})

test('router rejection and returned navigation failure show toasts, not an unhandled rejection', async () => {
  s.switchAccount('SALES-P02')
  globalThis.__mobileTest.router.replace = async () => { throw new Error('模拟路由失败') }
  await vm.switchAdmin({ accountId: 'OPS2' })
  assert.equal(s.account.id, 'OPS2')
  assert.equal(toasts.at(-1), '模拟路由失败')
  assert.equal(router.currentRoute.value.path, '/h5')
  globalThis.__mobileTest.router.replace = async () => ({ type: 4 })
  await vm.returnToDesktop()
  assert.match(toasts.at(-1), /未能返回 PC/)
})

test('switching to admin cancels pending sales interactions without committing a claim', async () => {
  s.switchAccount('SALES-P08')
  const lead = s.pool[0]
  const snapshot = JSON.stringify(s.state)
  let confirm
  globalThis.__mobileTest.confirm = () => new Promise(resolve => { confirm = resolve })
  const pending = vm.claimLead(lead)
  assert.equal(vm.saving.value, true)
  await vm.returnToDesktop()
  await vm.switchAdmin({ accountId: 'SYS1' })
  assert.equal(vm.saving.value, false)
  confirm()
  await pending
  assert.equal(JSON.stringify(s.state), snapshot)
  assert.equal(vm.detailOpen.value, false)
  assert.equal(s.account.role, 'sys')
  assert.match(toasts.at(-1), /身份已变化/)
})
