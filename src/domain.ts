export const CATEGORIES = ['液态奶', '冷饮', '冷藏', '婴幼儿奶粉', '非婴幼儿奶粉', '奶酪', '待确认']
export const HEADERS = ['序号', '标题', '发布时间', '采购单位', '所在地区', '品类标签', '预算金额', '招标编号', '投标截止时间', '联系方式', '渠道分类', '商机评级', '评级理由', '摘要']
export const FIELDS = ['serial', 'title', 'publishedAt', 'buyer', 'region', 'rawCategory', 'budget', 'bidNumber', 'deadline', 'contact', 'channel', 'rating', 'ratingReason', 'summary'] as const
export const ACTIVE = ['待接收', '跟进中', '还在沟通', '确认中']
export const FEEDBACK = ['跟进中', '还在沟通', '确认中', '中标', '未中标', '已放弃']
export type Lead = Record<typeof FIELDS[number], string> & {
  id: string; categories: string[]; pendingReason: string; createdAt: string
}
export type Person = {
  id: string; name: string; phone: string; company: string; department: string
  region: string; segments: string[]; categories: string[]; entity: string; enabled: boolean; wecomId: string
}
export type Account = { id: string; name: string; role: 'sys' | 'ops' | 'sales'; categories: string[]; personId?: string }
export type Rule = { raw: string; category: string }
export type Task = {
  id: string; leadId: string; salesId: string; entity: string; source: 'auto' | 'manual' | 'claim'
  status: string; notes: string; orders: string[]; createdAt: string; updatedAt: string
  events: { at: string; text: string }[]
}
export type ValidationError = { row: number; title: string; reason: string }
export type ImportRecord = {
  id: string; name: string; at: string; total: number; valid: number; failed: number
  auto: number; todo: number; errors: ValidationError[]
}
export type State = { leads: Lead[]; tasks: Task[]; people: Person[]; accounts: Account[]; rules: Rule[]; imports: ImportRecord[] }
export const DEFAULT_RULES: Rule[] = [
  { raw: '包装水', category: '液态奶' }, { raw: '常温奶', category: '液态奶' },
  { raw: '低温奶', category: '冷藏' }, { raw: '酸奶及益生菌', category: '冷藏' },
  { raw: '乳基原料', category: '液态奶' }, { raw: '冷饮', category: '冷饮' },
  { raw: '婴幼儿奶粉', category: '婴幼儿奶粉' }, { raw: '非婴幼儿奶粉', category: '非婴幼儿奶粉' },
  { raw: '奶酪', category: '奶酪' },
]
export function mapCategories(raw: string, rules: Rule[]): string[] {
  const labels = raw.split(/[,，、;；|/]+/).map(v => v.trim()).filter(Boolean)
  return [...new Set(labels.length ? labels.map(label => rules.find(r => r.raw === label)?.category || '待确认') : ['待确认'])]
}
export function normalizeDate(value: unknown): string {
  const text = String(value ?? '').trim()
  if (!text) return ''
  if (/^\d+(\.\d+)?$/.test(text) && Number(text) > 30000 && Number(text) < 70000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(text)) * 86400000).toISOString().slice(0, 10)
  }
  const m = text.match(/^(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})/)
  const short = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s|$)/)
  const parts = m ? [Number(m[1]), Number(m[2]), Number(m[3])]
    : short ? [Number(short[3]) < 100 ? 2000 + Number(short[3]) : Number(short[3]), Number(short[1]), Number(short[2])] : null
  if (!parts) return ''
  const [y, mo, day] = parts as [number, number, number]
  const date = new Date(Date.UTC(y, mo - 1, day))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== day) return ''
  return date.toISOString().slice(0, 10)
}
const clean = (value: string) => value.replace(/\s+/g, '').toLowerCase()
export function signatures(lead: Pick<Lead, 'title' | 'buyer' | 'publishedAt' | 'bidNumber'>): string[] {
  const result = [`title:${clean(lead.title)}|${clean(lead.buyer)}|${normalizeDate(lead.publishedAt)}`]
  if (lead.bidNumber) result.push(`bid:${clean(lead.buyer)}|${clean(lead.bidNumber)}`)
  return result
}
export function validateRows(rows: unknown[][], existing: Lead[], rules: Rule[], now: string) {
  const valid: Omit<Lead, 'id' | 'createdAt' | 'pendingReason'>[] = []
  const errors: ValidationError[] = []
  const headerIndex = rows.findIndex(row => row.some(cell => String(cell).trim() === '标题') && row.some(cell => String(cell).trim() === '发布时间'))
  if (headerIndex < 0) return { valid, errors: [{ row: 1, title: '工作表结构', reason: '未找到标题、发布时间表头；请使用标准模板首个工作表' }] }
  const header = rows[headerIndex]!.map(cell => String(cell ?? '').trim())
  const missing = HEADERS.filter(h => !header.includes(h))
  if (missing.length) return { valid, errors: [{ row: headerIndex + 1, title: '工作表结构', reason: `缺少列：${missing.join('、')}` }] }
  const seen = new Set(existing.flatMap(signatures))
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i]!
    if (!row.some(v => String(v ?? '').trim())) continue
    const lead = Object.fromEntries(FIELDS.map((field, n) => [field, String(row[header.indexOf(HEADERS[n]!)] ?? '').trim()])) as Record<typeof FIELDS[number], string>
    const reasons: string[] = []
    if (!lead.title) reasons.push('标题不能为空')
    if (!lead.region) reasons.push('所在地区不能为空')
    const published = normalizeDate(lead.publishedAt)
    if (!published) reasons.push('发布时间为空或格式无效')
    else if (published > now) reasons.push('发布时间不能晚于演示业务日期')
    if (lead.deadline && !normalizeDate(lead.deadline)) reasons.push('投标截止时间格式无效')
    if (lead.rating && !['A', 'B', 'C', 'D'].includes(lead.rating.toUpperCase())) reasons.push('评级仅支持 A/B/C/D 或空白')
    lead.rating = lead.rating.toUpperCase()
    lead.publishedAt = published
    const keys = signatures(lead)
    if (!reasons.length && keys.some(key => seen.has(key))) reasons.push('重复线索：标题+采购单位+发布日期，或采购单位+招标编号重复')
    if (reasons.length) errors.push({ row: i + 1, title: lead.title || '未填写标题', reason: reasons.join('；') })
    else {
      keys.forEach(key => seen.add(key))
      valid.push({ ...lead, categories: mapCategories(lead.rawCategory, rules) })
    }
  }
  return { valid, errors }
}
export function regionMatches(region: string, person: Person): boolean {
  if (!region || /全国|\.{2,}|…/.test(region)) return false
  const lead = clean(region).replace(/[－—]/g, '-')
  return person.segments.some(segment => {
    const target = clean(segment).replace(/[－—]/g, '-')
    return Boolean(target) && (target === lead || lead.startsWith(`${target}-`))
  })
}
export function eligibleSales(lead: Lead, person: Person): boolean {
  return person.enabled && regionMatches(lead.region, person) && lead.categories.some(c => c !== '待确认' && person.categories.includes(c))
}
export function canManage(account: Account, lead: Lead): boolean {
  return account.role === 'sys' || account.role === 'ops' && lead.categories.some(c => account.categories.includes(c))
}
export function inRecentMonth(lead: Lead, now: string): boolean {
  const end = new Date(`${now}T00:00:00Z`)
  const start = new Date(end)
  start.setUTCMonth(start.getUTCMonth() - 1)
  const date = normalizeDate(lead.publishedAt)
  return !lead.rating && Boolean(date) && date >= start.toISOString().slice(0, 10) && date <= now
}
export function validateFeedback(task: Task, status: string, orders: string[]) {
  if (!FEEDBACK.includes(status)) throw new Error('不支持的跟进状态')
  if (!ACTIVE.includes(task.status) || task.status === '待接收') throw new Error('请先接收任务；已结案或拒绝任务不能继续修改')
  if (new Set(orders).size !== orders.length) throw new Error('销售订单号不能重复')
  if (status === '中标' && (!orders.length || orders.some(o => !o.trim()))) throw new Error('中标必须填写至少一个有效销售订单号')
}
