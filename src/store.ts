import { reactive, watch } from 'vue'
import * as XLSX from 'xlsx'
import seed from './data/seed.json'
import {
  ACTIVE, CATEGORIES, DEFAULT_RULES, FIELDS, HEADERS, canManage, eligibleSales, inRecentMonth,
  mapCategories, validateFeedback, validateRows,
} from './domain'
import type { Account, ImportRecord, Lead, Person, Rule, State, Task } from './domain'

const KEY = 'yili-public-demo-v1'
const ACCOUNT_KEY = `${KEY}-account`
const NOW = '2026-10-10'
const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`
const stamp = () => `${NOW} ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`
function taskFor(lead: Lead, person: Person, source: Task['source']): Task {
  const at = stamp()
  return {
    id: id('T'), leadId: lead.id, salesId: person.id, entity: person.entity, source,
    status: source === 'claim' ? '跟进中' : '待接收', notes: '', orders: [], createdAt: at, updatedAt: at,
    events: [{ at, text: source === 'claim' ? '销售自主认领，开始跟进' : `${source === 'auto' ? '系统按地域与品类自动' : '运营手动'}派发给${person.name} · 承接方：${person.entity}` }],
  }
}
function initialState(): State {
  const demos = [
    ['演示销售01', '云南', ['云南-大理'], ['液态奶'], '虚构承接组织01'],
    ['演示销售02', '云南', ['云南'], ['液态奶'], '虚构承接组织02'],
    ['演示销售03', '内蒙古', ['内蒙古-赤峰', '内蒙古-呼和浩特'], ['液态奶'], '虚构承接组织03'],
    ['演示销售04', '广东', ['广东-东莞'], ['液态奶'], '虚构承接组织04'],
    ['演示销售05', '广东', ['广东-东莞'], ['冷藏'], '虚构承接组织05'],
    ['演示销售06', '浙江', ['浙江-杭州', '浙江-金华'], ['液态奶', '冷藏'], '虚构承接组织06'],
    ['演示销售07', '江苏', ['江苏-淮安', '江苏-泰州'], ['液态奶'], '虚构承接组织07'],
    ['演示销售08', '北京', ['北京'], ['液态奶', '冷饮'], '虚构承接组织08'],
    ['演示销售09', '陕西', ['陕西'], ['液态奶'], '虚构承接组织09'],
    ['演示销售10', '湖南', ['湖南', '江西'], ['液态奶', '冷藏'], '虚构承接组织10'],
    ['演示销售11', '河南', ['河南', '黑龙江'], ['液态奶', '冷藏', '奶酪'], '虚构承接组织11'],
    ['演示销售12', '广西', ['广西', '海南'], ['液态奶', '冷藏'], '虚构承接组织12'],
  ] as [string, string, string[], string[], string][]
  const people: Person[] = demos.map(([name, region, segments, categories, entity], i) => ({
    id: `P${String(i + 1).padStart(2, '0')}`, name: `${name}（模拟）`, region, segments, categories, entity, enabled: true,
    phone: '演示联系人，无真实联系方式', company: '虚构公开演示组织',
    department: `${region}业务组（模拟）`, wecomId: `demo_sales_${i + 1}`,
  }))
  const accounts: Account[] = [
    ...['演示管理员01', '演示管理员02', '演示管理员03'].map((name, i) => ({ id: `SYS${i + 1}`, name: `${name}（虚构）`, role: 'sys' as const, categories: [...CATEGORIES] })),
    ...CATEGORIES.map((category, i) => ({ id: `OPS${i + 1}`, name: `${category}运营（模拟）`, role: 'ops' as const, categories: [category] })),
    ...people.map(p => ({ id: `SALES-${p.id}`, name: p.name, role: 'sales' as const, categories: [...p.categories], personId: p.id })),
  ]
  const rows = [
    ['', ...HEADERS],
    ...seed.leads.map(raw => ['', ...FIELDS.map(field => raw[field] || '')]),
  ]
  const validation = validateRows(rows, [], DEFAULT_RULES, NOW)
  const leads: Lead[] = validation.valid.map(raw => ({
    ...raw, id: seed.leads.find(source => source.serial === raw.serial && source.title === raw.title)!.id, createdAt: `${NOW} 09:00:00`,
    pendingReason: raw.rating === 'D' ? 'D 级线索仅由运营手动派发'
      : !raw.rating ? '未评级：运营可手动派发，销售可在近一个月商机池认领' : '',
  }))
  const tasks: Task[] = []
  for (const lead of leads) {
    if (!['A', 'B', 'C'].includes(lead.rating)) continue
    const matching = people.filter(p => eligibleSales(lead, p))
    matching.forEach(person => tasks.push(taskFor(lead, person, 'auto')))
    if (!matching.length) lead.pendingReason = '自动派发失败：未找到同时匹配地域与品类的启用销售'
  }
  const illustrative = [
    { leadId: 'L001', salesId: 'P01', status: '跟进中', notes: '【模拟反馈】已与采购方沟通配送范围，正在准备服务方案。', orders: [] },
    { leadId: 'L002', salesId: 'P03', status: '确认中', notes: '【虚构反馈】演示项目规格已确认，用于展示任务状态。', orders: [] },
    { leadId: 'L004', salesId: 'P04', status: '已拒绝', notes: '【模拟反馈】本期配送运力不足，请运营重新派发。', orders: [] },
    { leadId: 'L004', salesId: 'P05', status: '中标', notes: '【模拟反馈】用于展示一条线索多个销售与多个订单的闭环，不代表真实中标。', orders: ['DEMO-SO-202610-001', 'DEMO-SO-202610-002'] },
  ]
  illustrative.forEach(item => {
    const task = tasks.find(t => t.leadId === item.leadId && t.salesId === item.salesId)
    if (task) {
      Object.assign(task, item)
      task.events.push({ at: `${NOW} 10:15:00`, text: `${item.status} · ${item.notes}` })
      if (item.status === '已拒绝') leads.find(l => l.id === task.leadId)!.pendingReason = '销售拒绝退回运营：配送运力不足；其他销售任务保留'
    }
  })
  return {
    leads, tasks, people, accounts, rules: DEFAULT_RULES.map(r => ({ ...r })),
    imports: [{
      id: 'I-SEED', name: seed.source, at: `${NOW} 09:00:00`, total: seed.leads.length,
      valid: leads.length, failed: validation.errors.length, auto: tasks.length,
      todo: leads.filter(l => !tasks.some(t => t.leadId === l.id)).length, errors: validation.errors,
    }],
  }
}
function loadState(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const value = JSON.parse(raw) as State
      if (['leads', 'tasks', 'people', 'accounts', 'rules', 'imports'].every(k => Array.isArray(value[k as keyof State]))) return value
    }
  } catch { /* Invalid local demo snapshots fall back to the seed. */ }
  return initialState()
}
function loadAccount(): string {
  try { return localStorage.getItem(ACCOUNT_KEY) || 'SYS1' }
  catch { return 'SYS1' }
}
class DemoStore {
  state = loadState()
  activeAccountId = loadAccount()
  now = NOW
  categories = [...CATEGORIES]
  headers = [...HEADERS]
  get account(): Account { return this.state.accounts.find(a => a.id === this.activeAccountId) || this.state.accounts[0]! }
  get isSys() { return this.account.role === 'sys' }
  get salesAccounts() { return this.state.accounts.filter(a => a.role === 'sales' && this.state.people.some(p => p.id === a.personId && p.enabled)) }
  get visibleLeads() { return this.state.leads.filter(l => this.canManage(l)) }
  get visibleTasks() { return this.state.tasks.filter(t => this.visibleLeads.some(l => l.id === t.leadId)) }
  get myTasks() { return this.account.role === 'sales' ? this.state.tasks.filter(t => t.salesId === this.account.personId && t.source !== 'claim') : [] }
  get myClaims() { return this.account.role === 'sales' ? this.state.tasks.filter(t => t.salesId === this.account.personId && t.source === 'claim') : [] }
  get pool() {
    if (this.account.role !== 'sales' || !this.state.people.some(p => p.id === this.account.personId && p.enabled)) return []
    return this.state.leads.filter(l => inRecentMonth(l, this.now) && !this.state.tasks.some(t => t.leadId === l.id && t.salesId === this.account.personId && (t.source === 'claim' || ACTIVE.includes(t.status))))
  }
  switchAccount(accountId: string) {
    const account = this.state.accounts.find(a => a.id === accountId)
    if (!account || account.role === 'sales' && !this.state.people.some(p => p.id === account.personId && p.enabled)) throw new Error('此模拟账户不存在或已停用')
    this.activeAccountId = accountId
  }
  requireSys() { if (!this.isSys) throw new Error('此操作仅限系统管理员') }
  canManage(lead: Lead) { return canManage(this.account, lead) }
  getLead(leadId: string) {
    const lead = this.state.leads.find(l => l.id === leadId)
    if (!lead) return undefined
    if (this.canManage(lead)) return lead
    if (this.account.role === 'sales' && (this.state.tasks.some(t => t.leadId === leadId && t.salesId === this.account.personId) || this.pool.some(l => l.id === leadId))) return lead
    return undefined
  }
  personName(personId: string) { return this.state.people.find(p => p.id === personId)?.name || '未知销售' }
  leadTasks(leadId: string) {
    const lead = this.state.leads.find(l => l.id === leadId)
    if (!lead) return []
    return this.state.tasks.filter(t => t.leadId === leadId && (this.canManage(lead) || this.account.role === 'sales' && t.salesId === this.account.personId))
  }
  leadStatus(lead: Lead): string {
    const tasks = this.leadTasks(lead.id)
    if (lead.pendingReason.startsWith('销售拒绝')) return '待派发'
    if (tasks.some(t => t.status === '待接收')) return '待接收'
    if (tasks.some(t => ['跟进中', '还在沟通', '确认中'].includes(t.status))) return '跟进中'
    if (tasks.some(t => ['中标', '未中标', '已放弃'].includes(t.status))) return '已结案'
    return lead.rating ? '待派发' : '待认领'
  }
  assign(leadIds: string[], salesIds: string[]) {
    if (!leadIds.length || !salesIds.length) throw new Error('请至少选择一条线索和一名销售')
    if (new Set(salesIds).size !== salesIds.length || new Set(leadIds).size !== leadIds.length) throw new Error('不能重复选择线索或销售')
    const leads = leadIds.map(leadId => {
      const lead = this.state.leads.find(l => l.id === leadId)
      if (!lead || !this.canManage(lead)) throw new Error('无权派发所选线索')
      return lead
    })
    const people = salesIds.map(salesId => {
      const person = this.state.people.find(p => p.id === salesId && p.enabled)
      if (!person) throw new Error('所选销售不存在或已停用')
      return person
    })
    for (const lead of leads) for (const person of people) {
      if (this.state.tasks.some(t => t.leadId === lead.id && t.salesId === person.id && ACTIVE.includes(t.status))) throw new Error(`${person.name}已有该线索的进行中任务，请勿重复派发`)
    }
    for (const lead of leads) {
      people.forEach(person => this.state.tasks.push(taskFor(lead, person, 'manual')))
      lead.pendingReason = ''
    }
    return leads.length * people.length
  }
  runAuto(leads: Lead[]) {
    let count = 0
    for (const lead of leads) {
      if (!['A', 'B', 'C'].includes(lead.rating) || lead.pendingReason.startsWith('销售拒绝')) continue
      const matching = this.state.people.filter(p => eligibleSales(lead, p))
      for (const person of matching) {
        if (!this.state.tasks.some(t => t.leadId === lead.id && t.salesId === person.id)) {
          this.state.tasks.push(taskFor(lead, person, 'auto'))
          count++
        }
      }
      lead.pendingReason = matching.length ? '' : '自动派发失败：未找到同时匹配地域与品类的启用销售'
    }
    return count
  }
  autoDispatch() { this.requireSys(); return this.runAuto(this.state.leads) }
  ownedTask(taskId: string) {
    const person = this.state.people.find(p => p.id === this.account.personId && p.enabled)
    const task = this.state.tasks.find(t => t.id === taskId)
    if (this.account.role !== 'sales' || !person || !task || task.salesId !== person.id) throw new Error('只能处理本人任务，且销售账户必须启用')
    return task
  }
  respond(taskId: string, accept: boolean, note: string) {
    const task = this.ownedTask(taskId)
    if (task.status !== '待接收') throw new Error('仅待接收任务可以接收或拒绝')
    if (!accept && !note.trim()) throw new Error('请填写拒绝原因')
    task.status = accept ? '跟进中' : '已拒绝'
    task.notes = note.trim()
    task.updatedAt = stamp()
    task.events.push({ at: task.updatedAt, text: accept ? '销售已接收，开始跟进' : `销售拒绝：${task.notes}；退回运营，其他销售任务保留` })
    if (!accept) this.state.leads.find(l => l.id === task.leadId)!.pendingReason = `销售拒绝退回运营：${task.notes}；其他销售任务保留`
  }
  feedback(taskId: string, status: string, notes: string, orderIds: string[]) {
    const task = this.ownedTask(taskId)
    const orders = orderIds.map(o => o.trim())
    validateFeedback(task, status, orders)
    task.status = status
    task.notes = notes.trim()
    task.orders = orders
    task.updatedAt = stamp()
    task.events.push({ at: task.updatedAt, text: `${status} · ${task.notes || '未填写备注'}${orders.length ? ` · 销售订单：${orders.join('、')}` : ''}` })
  }
  claim(leadId: string): Task {
    const lead = this.pool.find(l => l.id === leadId)
    const person = this.state.people.find(p => p.id === this.account.personId && p.enabled)
    if (!lead || !person || this.account.role !== 'sales') throw new Error('线索已认领、已有进行中任务或不在近一个月未评级商机池')
    const task = taskFor(lead, person, 'claim')
    this.state.tasks.push(task)
    return task
  }
  validateRows(rows: unknown[][]) { return validateRows(rows, this.state.leads, this.state.rules, this.now) }
  importRows(rows: unknown[][], filename: string): ImportRecord {
    this.requireSys()
    const result = this.validateRows(rows)
    const leads = result.valid.map(raw => ({
      ...raw, id: id('L'), createdAt: stamp(),
      pendingReason: raw.rating === 'D' ? 'D 级线索仅由运营手动派发' : !raw.rating ? '未评级：运营可手动派发，销售可在近一个月商机池认领' : '',
    }))
    this.state.leads.unshift(...leads)
    const auto = this.runAuto(leads)
    const record: ImportRecord = {
      id: id('I'), name: filename, at: stamp(), total: result.valid.length + result.errors.length,
      valid: leads.length, failed: result.errors.length, auto,
      todo: leads.filter(l => !this.state.tasks.some(t => t.leadId === l.id)).length, errors: result.errors,
    }
    this.state.imports.unshift(record)
    return record
  }
  exportFailures(record: ImportRecord) {
    this.requireSys()
    const sheet = XLSX.utils.json_to_sheet(record.errors.map(e => ({ 原始行号: e.row, 标题: e.title, 失败原因: e.reason })))
    sheet['!cols'] = [{ wch: 12 }, { wch: 60 }, { wch: 90 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, sheet, '校验失败')
    XLSX.writeFile(wb, `校验失败_${record.name.replace(/\.[^.]+$/, '')}.xlsx`)
  }
  savePerson(person: Person) {
    this.requireSys()
    if (![person.name, person.phone, person.region, person.entity, person.wecomId, person.company, person.department].every(v => v?.trim())) throw new Error('请完整填写演示姓名、联系说明、地域、承接方、企微标识、公司与部门')
    if (person.phone !== '演示联系人，无真实联系方式') throw new Error('公开演示仅接受固定联系说明，不可录入真实联系方式')
    if (!person.segments.length || !person.categories.length || person.categories.some(c => !CATEGORIES.includes(c))) throw new Error('请设置销售五段地域描述和有效负责品类')
    if (this.state.people.some(p => p.id !== person.id && p.wecomId === person.wecomId)) throw new Error('企微唯一标识不能重复')
    const index = this.state.people.findIndex(p => p.id === person.id)
    const copy = { ...person, segments: [...person.segments], categories: [...person.categories] }
    if (index >= 0) this.state.people[index] = copy
    else this.state.people.push(copy)
    const account = this.state.accounts.find(a => a.personId === person.id)
    if (account) { account.name = person.name; account.categories = [...person.categories] }
    else this.state.accounts.push({ id: `SALES-${person.id}`, name: person.name, role: 'sales', personId: person.id, categories: [...person.categories] })
  }
  saveRules(rules: Rule[]) {
    this.requireSys()
    if (rules.some(r => !r.raw.trim() || !CATEGORIES.includes(r.category)) || new Set(rules.map(r => r.raw.trim())).size !== rules.length) throw new Error('映射需唯一且目标品类有效')
    this.state.rules = rules.map(r => ({ raw: r.raw.trim(), category: r.category }))
    this.state.leads.forEach(l => { l.categories = mapCategories(l.rawCategory, this.state.rules) })
  }
  saveGrants(accountId: string, categories: string[]) {
    this.requireSys()
    const account = this.state.accounts.find(a => a.id === accountId && a.role === 'ops')
    if (!account || categories.some(c => !CATEGORIES.includes(c))) throw new Error('无效运营账户或授权品类')
    account.categories = [...new Set(categories)]
  }
  reset() {
    this.requireSys()
    this.state = initialState()
    this.activeAccountId = 'SYS1'
  }
}
const store = reactive(new DemoStore())
let applyingStorage = false
watch(() => store.state, state => {
  if (!applyingStorage) {
    try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { window.dispatchEvent(new CustomEvent('yili-storage-error')) }
  }
}, { deep: true, flush: 'sync' })
watch(() => store.activeAccountId, accountId => {
  if (!applyingStorage) {
    try { localStorage.setItem(ACCOUNT_KEY, accountId) } catch { window.dispatchEvent(new CustomEvent('yili-storage-error')) }
  }
}, { flush: 'sync' })
window.addEventListener('storage', event => {
  applyingStorage = true
  try {
    if (event.key === KEY && event.newValue) store.state = loadState()
    if (event.key === ACCOUNT_KEY && event.newValue) store.activeAccountId = event.newValue
  } finally { applyingStorage = false }
})
try { localStorage.setItem(KEY, JSON.stringify(store.state)) } catch { /* In-memory mode remains usable when storage is unavailable. */ }
export function useStore() { return store }
