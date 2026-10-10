<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import 'element-plus/dist/index.css'
import { House, Tickets, Clock, UploadFilled, User, Setting, Lock, Iphone, Search, ArrowRight, Plus, Refresh, Download, Bell, Check, TrendCharts, Connection, ArrowDown, OfficeBuilding, CircleCheck } from '@element-plus/icons-vue'
import * as XLSX from 'xlsx'
import { useStore } from '../store'
import '../styles/desktop.css'

const s = useStore()
const route = useRoute()
const router = useRouter()
const navigation = [
  { label: '工作概览', path: '/overview', icon: House, group: '工作空间' },
  { label: '业务线索', path: '/leads', icon: Tickets, group: '工作空间' },
  { label: '待处理池', path: '/pending', icon: Clock, group: '工作空间' },
  { label: '导入中心', path: '/imports', icon: UploadFilled, group: '工作空间', sys: true },
  { label: '销售人员', path: '/team', icon: User, group: '组织与配置' },
  { label: '派发规则', path: '/rules', icon: Connection, group: '组织与配置', sys: true },
  { label: '账号权限', path: '/permissions', icon: Lock, group: '组织与配置', sys: true },
  { label: '移动工作台', path: '/mobile', icon: Iphone, group: '应用' },
]
const navItems = computed(() => navigation.filter(n => !n.sys || s.isSys))
const currentNav = computed(() => navigation.find(n => n.path === route.path))
const restricted = computed(() => s.account.role === 'sales' || Boolean(currentNav.value?.sys && !s.isSys))
const roleName = (role: string) => ({ sys: '系统管理员', ops: '业务运营', sales: '销售人员' }[role] || role)
watch(() => s.account.role, role => {
  if (role === 'sales') void router.replace('/h5')
}, { immediate: true })
const search = ref('')
const status = ref('')
const category = ref('')
const region = ref('')
const rating = ref('')
const page = ref(1)
const pageSize = ref(10)
const selected = ref<any[]>([])
const table = ref<any>()
const detailId = ref('')
const detail = computed(() => s.visibleLeads.find(l => l.id === detailId.value))
const detailOpen = ref(false)
const visible = computed(() => s.visibleLeads)
const tasks = computed(() => s.visibleTasks)
const pending = computed(() => visible.value.filter((lead: any) => ['待派发', '待认领'].includes(s.leadStatus(lead))))
const regions = computed<string[]>(() => [...new Set(visible.value.map((l: any) => l.region).filter(Boolean))] as string[])
const filtered = computed(() => {
  const source = route.path === '/pending' ? pending.value : visible.value
  const text = search.value.trim().toLowerCase()
  return source.filter((l: any) =>
    (!text || [l.title, l.buyer, l.id, l.serial, l.bidNumber].some(v => String(v || '').toLowerCase().includes(text))) &&
    (!status.value || s.leadStatus(l) === status.value) &&
    (!category.value || l.categories.includes(category.value)) &&
    (!region.value || l.region === region.value) &&
    (!rating.value || (rating.value === '未评级' ? !l.rating : l.rating === rating.value)))
})
const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
watch([search, status, category, region, rating, () => route.path, () => s.account.id], () => {
  page.value = 1
  selected.value = []
  table.value?.clearSelection()
})
watch(() => s.account.id, () => {
  detailOpen.value = false
  assignOpen.value = false
  previewOpen.value = false
  personOpen.value = false
  historyOpen.value = false
  historyDetail.value = null
  importRows.value = []
  validation.value = { valid: [], errors: [] }
})
watch(() => filtered.value.length, () => {
  page.value = Math.min(page.value, Math.max(1, Math.ceil(filtered.value.length / pageSize.value)))
})
const stats = computed(() => [
  { name: '业务线索总量', value: visible.value.length, unit: '条', icon: Tickets, class: 'blue', note: '当前账号可见的业务线索' },
  { name: '待处理线索', value: pending.value.length, unit: '条', icon: Clock, class: 'amber', note: '待派发、待认领或存在拒绝' },
  { name: '在跟进任务', value: tasks.value.filter((t: any) => ['跟进中', '还在沟通', '确认中'].includes(t.status)).length, unit: '项', icon: TrendCharts, class: 'purple', note: '跟进中 / 还在沟通 / 确认中' },
  { name: '已中标任务', value: tasks.value.filter((t: any) => t.status === '中标').length, unit: '项', icon: CircleCheck, class: 'green', note: '从机会识别到业务转化' },
])
const ratingStats = computed(() => ['A', 'B', 'C', 'D', '未评级'].map(label => ({
  label, value: visible.value.filter((l: any) => label === '未评级' ? !l.rating : l.rating === label).length,
})))
const categoryStats = computed(() => s.categories.map((label: string) => ({
  label, value: visible.value.filter((l: any) => l.categories.includes(label)).length,
})))
const regionStats = computed(() => regions.value.map(label => ({
  label, value: visible.value.filter((l: any) => l.region === label).length,
})).sort((a, b) => b.value - a.value).slice(0, 5))
const latest = computed(() => [...visible.value].sort((a: any, b: any) => String(b.publishedAt).localeCompare(String(a.publishedAt))).slice(0, 5))
const coverage = computed(() => visible.value.length ? Math.round(visible.value.filter((l: any) => s.leadTasks(l.id).length).length / visible.value.length * 100) : 0)
const statusClass = (text: string) => ['中标', '已结案'].includes(text) ? 'green' : ['待派发', '待认领', '待接收'].includes(text) ? 'amber' : ['已拒绝', '未中标', '已放弃'].includes(text) ? 'muted' : 'blue'
const pendingText = (lead: any) => lead.pendingReason || (!lead.rating ? '未评级，进入待认领池' : lead.rating === 'D' ? 'D 级线索，不参与自动派发' : '暂无符合地域与品类条件的销售')
function openLead(lead: any) { detailId.value = lead.id; detailOpen.value = true }
function clearFilters() { search.value = ''; status.value = ''; category.value = ''; region.value = ''; rating.value = '' }
function notifyError(error: unknown) { ElMessage.error(error instanceof Error ? error.message : String(error)) }
const assignOpen = ref(false)
const assignIds = ref<string[]>([])
const salesIds = ref<string[]>([])
const salesSearch = ref('')
const eligible = computed(() => s.state.people.filter((p: any) =>
  p.enabled && (!salesSearch.value || [p.name, p.region, p.entity, ...p.categories].join(' ').includes(salesSearch.value)) &&
  assignIds.value.every(id => !s.leadTasks(id).some((t: any) => t.salesId === p.id && ['待接收', '跟进中', '还在沟通', '确认中'].includes(t.status)))))
function beginAssign(leads: any[]) {
  const manageable = leads.filter(l => s.canManage(l))
  if (!manageable.length) return ElMessage.warning('请选择有管理权限的线索')
  if (manageable.length !== leads.length) return ElMessage.warning('选择中包含无权派发的线索')
  assignIds.value = manageable.map(l => l.id)
  salesIds.value = []
  salesSearch.value = ''
  assignOpen.value = true
}
function confirmAssign() {
  try {
    const count = s.assign(assignIds.value, salesIds.value)
    ElMessage.success(`派发成功，新增 ${count} 个销售任务`)
    assignOpen.value = false
    table.value?.clearSelection()
  } catch (error) { notifyError(error) }
}
async function autoDispatch() {
  try {
    await ElMessageBox.confirm('仅对 A / B / C 级线索执行地域与品类双条件匹配，不会重复派发已有任务。', '执行自动派发', { confirmButtonText: '开始派发', cancelButtonText: '取消', type: 'info' })
    ElMessage.success(`自动派发完成，新增 ${s.autoDispatch()} 个任务`)
  } catch (error) { if (error !== 'cancel' && error !== 'close') notifyError(error) }
}
const previewOpen = ref(false)
const importName = ref('')
const importRows = ref<any[][]>([])
const validation = ref<{ valid: any[]; errors: { row: number; title: string; reason: string }[] }>({ valid: [], errors: [] })
const importing = ref(false)
const uploadBusy = ref(false)
async function readWorkbook(file: File) {
  if (!s.isSys) return false
  const accountId = s.account.id
  if (!/\.(xlsx|xls)$/i.test(file.name)) { ElMessage.warning('请选择 .xlsx 或 .xls 文件'); return false }
  uploadBusy.value = true
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
    if (!s.isSys || s.account.id !== accountId) return false
    const sheetName = wb.SheetNames[0]
    if (!sheetName) throw new Error('工作簿不包含工作表')
    importRows.value = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]!, { header: 1, defval: '', raw: false }) as any[][]
    validation.value = s.validateRows(importRows.value)
    importName.value = file.name
    previewOpen.value = true
  } catch (error) { notifyError(error) }
  finally { uploadBusy.value = false }
  return false
}
function confirmImport() {
  importing.value = true
  try {
    const record = s.importRows(importRows.value, importName.value)
    ElMessage.success(`导入完成：有效 ${record.valid} 条，失败 ${record.failed} 条`)
    previewOpen.value = false
    importRows.value = []
  } catch (error) { notifyError(error) }
  finally { importing.value = false }
}
function exportFailures(record: any) {
  try { s.exportFailures(record) } catch (error) { notifyError(error) }
}
function exportPreviewFailures() {
  exportFailures({
    id: 'preview', name: importName.value, at: s.now,
    total: validation.value.valid.length + validation.value.errors.length,
    valid: validation.value.valid.length, failed: validation.value.errors.length,
    auto: 0, todo: 0, errors: validation.value.errors,
  })
}
const historyDetail = ref<any>(null)
const historyOpen = ref(false)
function showImport(record: any) { historyDetail.value = record; historyOpen.value = true }
const personOpen = ref(false)
const personForm = ref<any>({})
const personSearch = ref('')
const roster = computed(() => s.state.people.filter((p: any) => !personSearch.value || [p.name, p.region, p.phone, p.entity, ...p.categories].join(' ').includes(personSearch.value)))
const segmentOptions = computed<string[]>(() => [...new Set(s.state.people.flatMap((p: any) => p.segments))] as string[])
function editPerson(person?: any) {
  personForm.value = person ? { ...person, phone: '演示联系人，无真实联系方式', categories: [...person.categories], segments: [...person.segments] } : {
    id: `P-${Date.now()}`, name: '', phone: '演示联系人，无真实联系方式', company: '演示公司', department: '', region: '', segments: [], categories: [], entity: '', enabled: true, wecomId: '',
  }
  personOpen.value = true
}
function savePerson() {
  if (![personForm.value.name, personForm.value.region, personForm.value.entity].every((v: any) => String(v || '').trim())) return ElMessage.warning('请填写演示姓名、地域和签约主体')
  try {
    s.savePerson({ ...personForm.value, phone: '演示联系人，无真实联系方式', categories: [...personForm.value.categories], segments: [...personForm.value.segments] })
    personOpen.value = false
    ElMessage.success('人员信息已保存')
  } catch (error) { notifyError(error) }
}
const rulesDraft = ref<any[]>([])
watch(() => route.path, path => { if (path === '/rules') rulesDraft.value = s.state.rules.map((r: any) => ({ ...r })) }, { immediate: true })
watch(() => s.state.rules, rules => { rulesDraft.value = rules.map((r: any) => ({ ...r })) }, { deep: true })
function saveRules() {
  if (rulesDraft.value.some(r => !r.raw.trim() || !r.category)) return ElMessage.warning('请完整填写演示分类和目标业务品类')
  if (new Set(rulesDraft.value.map(r => r.raw.trim())).size !== rulesDraft.value.length) return ElMessage.warning('演示分类映射不可重复')
  try { s.saveRules(rulesDraft.value.map(r => ({ raw: r.raw.trim(), category: r.category }))); ElMessage.success('品类映射已保存') }
  catch (error) { notifyError(error) }
}
const opsAccounts = computed(() => s.state.accounts.filter((a: any) => a.role === 'ops'))
const grants = ref<Record<string, string[]>>({})
watch(() => s.state.accounts, accounts => { grants.value = Object.fromEntries(accounts.filter((a: any) => a.role === 'ops').map((a: any) => [a.id, [...a.categories]])) }, { immediate: true, deep: true })
function saveGrant(account: any) {
  try { s.saveGrants(account.id, grants.value[account.id] || []); ElMessage.success(`${account.name} 的品类权限已保存`) }
  catch (error) { notifyError(error) }
}
function switchAccount(id: string) {
  try { s.switchAccount(id) } catch (error) { notifyError(error) }
}
async function resetDemo() {
  try {
    await ElMessageBox.confirm('将清除本地导入、派发、跟进与配置修改，恢复初始演示数据。此操作不可撤销。', '重置演示数据', { type: 'warning', confirmButtonText: '确认重置', cancelButtonText: '取消' })
    s.reset()
    ElMessage.success('已恢复初始演示数据')
  } catch (error) { if (error !== 'cancel' && error !== 'close') notifyError(error) }
}
const demoFields = [
  ['serial', '演示序号'], ['publishedAt', '演示发布时间'], ['buyer', '演示采购单位'], ['region', '演示采购地域'],
  ['rawCategory', '演示分类'], ['budget', '演示采购预算'], ['bidNumber', '演示招标编号'], ['deadline', '演示投标截止'],
  ['contact', '演示联系信息'], ['channel', '演示渠道'], ['rating', '线索评级'], ['ratingReason', '评级依据'],
  ['summary', '演示摘要'], ['createdAt', '演示导入时间'],
] as const
</script>

<template>
  <div class="desktop-app">
    <div class="desk-small-screen">当前为 PC 管理工作台，建议使用宽屏浏览器。<a :href="router.resolve('/h5').href">小屏设备请打开移动工作台 →</a></div>
    <aside class="desk-sidebar">
      <div class="desk-brand"><div class="desk-logo"><span>YL</span><i></i></div><div><strong>YL Dispatch</strong><small>PUBLIC DEMO</small></div></div>
      <div class="desk-workspace"><span class="desk-workspace-dot"></span> 业务发展工作空间 <span class="desk-workspace-tag">PC</span></div>
      <nav aria-label="主导航">
        <template v-for="group in ['工作空间', '组织与配置', '应用']" :key="group">
          <div class="desk-nav-label">{{ group }}</div>
          <router-link v-for="item in navItems.filter(n => n.group === group)" :key="item.path" :to="item.path" class="desk-nav-item" :class="{ active: route.path === item.path }">
            <el-icon><component :is="item.icon" /></el-icon><span>{{ item.label }}</span>
            <span v-if="item.path === '/pending' && pending.length" class="desk-nav-count">{{ pending.length }}</span>
          </router-link>
        </template>
      </nav>
      <div class="desk-sidebar-bottom"><div class="desk-local-indicator"><span></span> 本地原型 · 数据不上传</div><p>让每一个商机<br>找到合适的伙伴。</p><small>机会连接业务，协同创造价值</small></div>
    </aside>

    <div class="desk-shell">
      <header class="desk-topbar">
        <div class="desk-breadcrumb">业务协同平台 <span>/</span> <strong>{{ currentNav?.label || '工作空间' }}</strong></div>
        <div class="desk-topbar-right"><span class="desk-prototype">公开演示 · 合成信息</span><span class="desk-date">演示日期：{{ s.now }}</span><span class="desk-topbar-divider"></span>
          <el-dropdown trigger="click" @command="switchAccount" popper-class="desk-account-menu">
            <button class="desk-account-button"><span class="desk-avatar">{{ s.account.name.slice(0, 1) }}</span><span><strong>{{ s.account.name }}</strong><small>{{ roleName(s.account.role) }}</small></span><el-icon><ArrowDown /></el-icon></button>
            <template #dropdown><el-dropdown-menu>
              <template v-for="role in ['sys', 'ops', 'sales']" :key="role">
                <div class="desk-account-group">{{ roleName(role) }} · 演示切换</div>
                <el-dropdown-item v-for="account in s.state.accounts.filter((a: any) => a.role === role)" :key="account.id" :command="account.id">
                  <span>{{ account.name }}</span><el-icon v-if="account.id === s.account.id"><Check /></el-icon>
                </el-dropdown-item>
              </template>
            </el-dropdown-menu></template>
          </el-dropdown>
        </div>
      </header>

      <main class="desk-main">
        <div v-if="restricted" class="desk-restricted desk-card"><el-icon><Lock /></el-icon><h2>此页面需要系统管理权限</h2><p>当前账号仅可查看已授权品类。销售账号请使用移动工作台。</p><el-button type="primary" @click="router.push(s.account.role === 'sales' ? '/h5' : '/overview')">返回工作台</el-button></div>

        <template v-else-if="route.path === '/overview'">
          <div class="desk-page-heading"><div><div class="desk-eyebrow">YOUR BUSINESS, CONNECTED</div><h1>工作概览<span class="desk-heading-dot">.</span></h1><p>欢迎回来，{{ s.account.name }}。每一条线索，都是新的业务可能。</p></div><el-button type="primary" :icon="s.isSys ? UploadFilled : Tickets" @click="router.push(s.isSys ? '/imports' : '/leads')">{{ s.isSys ? '导入新线索' : '查看业务线索' }}</el-button></div>
          <div v-if="!s.isSys" class="desk-scope-banner"><el-icon><Lock /></el-icon> 当前数据范围：<strong>{{ s.account.categories.join('、') || '暂无品类授权' }}</strong><span>按品类隔离 · 仅显示授权业务</span></div>
          <section class="desk-stats"><div v-for="stat in stats" :key="stat.name" class="desk-stat desk-card"><div class="desk-stat-top"><span>{{ stat.name }}</span><span class="desk-stat-icon" :class="stat.class"><el-icon><component :is="stat.icon" /></el-icon></span></div><div class="desk-stat-value">{{ stat.value }}<small>{{ stat.unit }}</small></div><div class="desk-stat-note"><span :class="stat.class"></span>{{ stat.note }}</div></div></section>
          <section class="desk-overview-middle">
            <div class="desk-card desk-distribution"><div class="desk-card-heading"><div><h3>线索质量分布</h3><p>基于合成演示评级，展示机会分布</p></div><span class="desk-subtle-tag">当前可见</span></div>
              <div class="desk-quality-content"><div class="desk-donut" :style="{ '--coverage': coverage + '%' }"><div><strong>{{ coverage }}<small>%</small></strong><span>线索派发覆盖率</span></div></div><div class="desk-rating-bars"><div v-for="item in ratingStats" :key="item.label" class="desk-rating-bar"><span class="desk-rating" :class="'rating-' + item.label">{{ item.label }}</span><div class="desk-bar-track"><i :style="{ width: (visible.length ? item.value / visible.length * 100 : 0) + '%' }" :class="'rating-fill-' + item.label"></i></div><strong>{{ item.value }}</strong></div></div></div>
              <div class="desk-card-foot"><el-icon><Connection /></el-icon> A / B / C 自动匹配 · D 级与未评级进入人工处理</div>
            </div>
            <div class="desk-action-card"><div class="desk-action-decoration"><svg viewBox="0 0 180 140" aria-hidden="true"><path d="M10 115L65 75L107 93L168 22" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="2"/><path d="M10 132L65 99L107 106L168 53" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="2"/><circle cx="168" cy="22" r="6" fill="#83e5d1"/></svg></div><span class="desk-action-kicker">NEXT BEST ACTION</span><h2>让商机流动起来</h2><p>还有 <strong>{{ pending.length }}</strong> 条线索等待进一步处理。<br>完善匹配、人工派发，让机会不遗漏。</p><button @click="router.push('/pending')">前往待处理池 <el-icon><ArrowRight /></el-icon></button><small><span></span> 地域 × 品类，精准连接销售</small></div>
          </section>
          <section class="desk-overview-bottom">
            <div class="desk-card desk-category-card"><div class="desk-card-heading"><div><h3>业务品类分布</h3><p>多品类线索分别计数</p></div><el-icon><OfficeBuilding /></el-icon></div><div class="desk-category-bars"><div v-for="(item, index) in categoryStats" :key="item.label"><div><span>{{ item.label }}</span><strong>{{ item.value }} <small>条</small></strong></div><div class="desk-bar-track"><i :style="{ width: item.value / Math.max(1, ...categoryStats.map(x => x.value)) * 100 + '%', opacity: 1 - index * .09 }"></i></div></div></div></div>
            <div class="desk-card desk-region-card"><div class="desk-card-heading"><div><h3>地域热度</h3><p>线索数量 TOP 5</p></div><span class="desk-subtle-tag">{{ regions.length }} 个地域</span></div><div v-for="(item, index) in regionStats" :key="item.label" class="desk-region-row"><span class="desk-rank" :class="{ top: index < 3 }">{{ String(index + 1).padStart(2, '0') }}</span><span>{{ item.label }}</span><div class="desk-bar-track"><i :style="{ width: item.value / Math.max(1, regionStats[0]?.value || 1) * 100 + '%' }"></i></div><strong>{{ item.value }}</strong></div><el-empty v-if="!regionStats.length" description="暂无地域数据" :image-size="70" /></div>
          </section>
          <section class="desk-card desk-latest"><div class="desk-card-heading"><div><h3>最新业务线索</h3><p>合成演示内容，按演示发布时间排序</p></div><el-button link type="primary" @click="router.push('/leads')">查看全部 <el-icon><ArrowRight /></el-icon></el-button></div><el-table :data="latest" @row-click="openLead" class="desk-click-table"><el-table-column label="线索名称" min-width="400"><template #default="{ row }"><div class="desk-lead-title">{{ row.title }}</div><div class="desk-lead-meta">{{ row.buyer }}</div></template></el-table-column><el-table-column prop="region" label="地域" width="145" /><el-table-column label="评级" width="90"><template #default="{ row }"><span class="desk-rating" :class="'rating-' + (row.rating || '未评级')">{{ row.rating || '—' }}</span></template></el-table-column><el-table-column label="状态" width="115"><template #default="{ row }"><span class="desk-status" :class="statusClass(s.leadStatus(row))">{{ s.leadStatus(row) }}</span></template></el-table-column><el-table-column prop="publishedAt" label="演示发布时间" width="120" /></el-table></section>
        </template>

        <template v-else-if="['/leads', '/pending'].includes(route.path)">
          <div class="desk-page-heading"><div><div class="desk-eyebrow">OPPORTUNITY MANAGEMENT</div><h1>{{ route.path === '/pending' ? '待处理池' : '业务线索' }}<span class="desk-heading-dot">.</span></h1><p>{{ route.path === '/pending' ? '集中处理自动匹配失败、D 级、未评级与销售拒绝的线索。' : '从机会识别到销售跟进，让每一条线索有迹可循。' }}</p></div><div class="desk-heading-actions"><el-button v-if="s.isSys" :icon="Connection" @click="autoDispatch">自动派发</el-button><el-button type="primary" :icon="User" :disabled="!selected.length" @click="beginAssign(selected)">批量派发<span v-if="selected.length">（{{ selected.length }}）</span></el-button></div></div>
          <div v-if="route.path === '/pending'" class="desk-info-banner"><el-icon><Bell /></el-icon><div><strong>人工判断，让机会不遗漏</strong><span>未评级线索可待认领；人工派发可跨地域、跨品类选择启用的销售，仍受运营品类授权约束。</span></div></div>
          <div class="desk-card desk-lead-card"><div class="desk-filter-bar"><el-input v-model="search" placeholder="搜索线索名称 / 采购单位 / 编号" :prefix-icon="Search" clearable class="desk-search" /><el-select v-model="status" placeholder="全部状态" clearable><el-option v-for="v in ['待派发', '待认领', '待接收', '跟进中', '已结案']" :key="v" :label="v" :value="v" /></el-select><el-select v-model="category" placeholder="业务品类" clearable><el-option v-for="v in s.categories" :key="v" :label="v" :value="v" /></el-select><el-select v-model="region" placeholder="采购地域" clearable filterable><el-option v-for="v in regions" :key="v" :label="v" :value="v" /></el-select><el-select v-model="rating" placeholder="评级" clearable><el-option v-for="v in ['A', 'B', 'C', 'D', '未评级']" :key="v" :label="v" :value="v" /></el-select><el-button link @click="clearFilters">重置</el-button></div>
            <div class="desk-table-caption"><span>共 <strong>{{ filtered.length }}</strong> 条线索 <small v-if="!s.isSys">· 仅显示授权品类</small></span><span v-if="selected.length" class="desk-selection-note">已选择 {{ selected.length }} 条</span><span v-else class="desk-table-hint">点击线索名称查看完整信息</span></div>
            <el-table ref="table" :data="paged" row-key="id" @selection-change="(rows: any[]) => selected = rows" empty-text="没有符合条件的线索，请调整筛选条件">
              <el-table-column type="selection" width="46" :selectable="(row: any) => s.canManage(row)" />
              <el-table-column label="线索 / 采购单位" min-width="300"><template #default="{ row }"><button class="desk-title-button" @click="openLead(row)">{{ row.title }}</button><div class="desk-lead-meta">{{ row.id }}<span>·</span>{{ row.buyer }}</div></template></el-table-column>
              <el-table-column label="业务品类" width="155"><template #default="{ row }"><div class="desk-tags"><span v-for="v in row.categories" :key="v" class="desk-category-tag">{{ v }}</span><span v-if="!row.categories.length" class="desk-muted">待映射</span></div></template></el-table-column>
              <el-table-column prop="region" label="地域" width="120" />
              <el-table-column prop="budget" label="采购预算" width="125" show-overflow-tooltip />
              <el-table-column label="评级" width="70"><template #default="{ row }"><span class="desk-rating" :class="'rating-' + (row.rating || '未评级')">{{ row.rating || '—' }}</span></template></el-table-column>
              <el-table-column label="处理状态" width="105"><template #default="{ row }"><span class="desk-status" :class="statusClass(s.leadStatus(row))">{{ s.leadStatus(row) }}</span></template></el-table-column>
              <el-table-column v-if="route.path === '/pending'" label="待处理原因" width="185" show-overflow-tooltip><template #default="{ row }">{{ pendingText(row) }}</template></el-table-column>
              <el-table-column v-else prop="publishedAt" label="发布时间" width="115" />
              <el-table-column label="操作" width="100" fixed="right"><template #default="{ row }"><el-button link type="primary" :disabled="!s.canManage(row)" @click="beginAssign([row])">派发 <el-icon><ArrowRight /></el-icon></el-button></template></el-table-column>
            </el-table><div class="desk-pagination"><span>每条线索可派发给多名销售，重复销售任务不可创建</span><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10, 20, 50]" :total="filtered.length" layout="sizes, prev, pager, next" background /></div>
          </div>
        </template>

        <template v-else-if="route.path === '/imports'">
          <div class="desk-page-heading"><div><div class="desk-eyebrow">DATA INGESTION</div><h1>导入中心<span class="desk-heading-dot">.</span></h1><p>先校验，再导入。将业务数据转化为可协同的销售机会。</p></div><span class="desk-page-chip"><el-icon><Lock /></el-icon> 系统管理员专属</span></div>
          <div class="desk-import-layout"><div class="desk-card desk-upload-card"><div class="desk-card-heading"><div><h3>上传业务线索</h3><p>Excel 工作簿 · 仅解析第一个工作表</p></div><span class="desk-subtle-tag">XLSX / XLS</span></div><el-upload drag :show-file-list="false" :before-upload="readWorkbook" accept=".xlsx,.xls" :disabled="uploadBusy"><div class="desk-upload-icon"><el-icon><UploadFilled /></el-icon></div><h3>{{ uploadBusy ? '正在读取工作簿…' : '将 Excel 文件拖到这里' }}</h3><p>或 <span>点击选择本地文件</span></p><small>浏览器内解析，不上传服务器</small></el-upload><div class="desk-import-steps"><div><span>01</span><strong>读取首表</strong></div><el-icon><ArrowRight /></el-icon><div><span>02</span><strong>预览校验</strong></div><el-icon><ArrowRight /></el-icon><div><span>03</span><strong>确认导入</strong></div></div></div>
            <div class="desk-card desk-import-guide"><h3>导入前，请确认</h3><div><span>1</span><p><strong>使用规定的 14 列表头</strong><small>支持首列空白、表头从 B 列开始。以实际表头识别业务字段。</small></p></div><div><span>2</span><p><strong>解释行不进入业务线索</strong><small>无效与说明性数据会列入失败清单，不污染业务数据。</small></p></div><div><span>3</span><p><strong>校验预览不会修改数据</strong><small>只有点击「确认导入」才写入本地存储并执行导入流程。</small></p></div><div class="desk-header-chips"><span v-for="header in s.headers" :key="header">{{ header }}</span></div></div></div>
          <section class="desk-card"><div class="desk-card-heading"><div><h3>导入记录</h3><p>包含初始合成样本与后续本地演示导入记录</p></div><span class="desk-subtle-tag">{{ s.state.imports.length }} 次导入</span></div><el-table :data="[...s.state.imports].reverse()" empty-text="暂无导入记录"><el-table-column label="演示文件名称" min-width="280"><template #default="{ row }"><button class="desk-title-button" @click="showImport(row)">{{ row.name }}</button><div class="desk-lead-meta">{{ row.at }}</div></template></el-table-column><el-table-column prop="total" label="总行数" width="80" /><el-table-column label="有效" width="80"><template #default="{ row }"><strong class="desk-success-text">{{ row.valid }}</strong></template></el-table-column><el-table-column label="失败" width="80"><template #default="{ row }"><strong :class="{ 'desk-warning-text': row.failed }">{{ row.failed }}</strong></template></el-table-column><el-table-column prop="auto" label="自动派发" width="100" /><el-table-column prop="todo" label="待处理" width="90" /><el-table-column label="操作" width="190"><template #default="{ row }"><el-button link type="primary" @click="showImport(row)">查看详情</el-button><el-button link type="primary" :disabled="!row.failed" @click="exportFailures(row)">失败清单</el-button></template></el-table-column></el-table></section>
        </template>

        <template v-else-if="route.path === '/team'">
          <div class="desk-page-heading"><div><div class="desk-eyebrow">SALES ORGANIZATION</div><h1>销售人员<span class="desk-heading-dot">.</span></h1><p>维护销售覆盖范围与签约主体，为精准派发建立组织基础。</p></div><el-button v-if="s.isSys" type="primary" :icon="Plus" @click="editPerson()">新增销售人员</el-button><span v-else class="desk-page-chip"><el-icon><Lock /></el-icon> 只读人员名录</span></div>
          <div class="desk-info-banner"><el-icon><User /></el-icon><div><strong>合成人员，仅供演示</strong><span>所有销售姓名及组织配置均为合成示例；联系人无真实联系方式。地域与业务品类共同决定自动匹配；五段地域描述以标签展示。</span></div></div>
          <div class="desk-card"><div class="desk-roster-toolbar"><div class="desk-inline-metrics"><strong>{{ s.state.people.length }}</strong> 名销售<span></span><strong class="desk-success-text">{{ s.state.people.filter((p: any) => p.enabled).length }}</strong> 名启用</div><el-input v-model="personSearch" :prefix-icon="Search" clearable placeholder="搜索姓名 / 地域 / 品类" /></div><el-table :data="roster" empty-text="未找到匹配的销售人员"><el-table-column label="销售人员 / 演示联系人" min-width="260"><template #default="{ row }"><div class="desk-person-cell"><span class="desk-avatar">{{ row.name.slice(0, 1) }}</span><div><strong>{{ row.name }}</strong><small>演示联系人，无真实联系方式</small></div></div></template></el-table-column><el-table-column label="所属组织" min-width="165"><template #default="{ row }"><div>{{ row.company }}</div><div class="desk-lead-meta">{{ row.department }}</div></template></el-table-column><el-table-column label="地域覆盖 / 五段描述" min-width="220"><template #default="{ row }"><div class="desk-person-region">{{ row.region }}</div><div class="desk-tags"><span v-for="(v, index) in row.segments" :key="index" class="desk-region-tag">{{ v }}</span></div></template></el-table-column><el-table-column label="业务品类" min-width="180"><template #default="{ row }"><div class="desk-tags"><span v-for="v in row.categories" :key="v" class="desk-category-tag">{{ v }}</span></div></template></el-table-column><el-table-column prop="entity" label="签约主体" min-width="155" /><el-table-column label="状态" width="95"><template #default="{ row }"><span class="desk-status" :class="row.enabled ? 'green' : 'muted'">{{ row.enabled ? '已启用' : '已停用' }}</span></template></el-table-column><el-table-column v-if="s.isSys" label="操作" width="85" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="editPerson(row)">编辑</el-button></template></el-table-column></el-table></div>
        </template>

        <template v-else-if="route.path === '/rules'">
          <div class="desk-page-heading"><div><div class="desk-eyebrow">DISPATCH ENGINE</div><h1>派发规则<span class="desk-heading-dot">.</span></h1><p>可解释的匹配逻辑，让每一次派发都有据可依。</p></div><el-button type="primary" :icon="Connection" @click="autoDispatch">执行自动派发</el-button></div>
          <div class="desk-rule-flow"><div class="desk-card"><span class="desk-step-number">01</span><h3>评级筛选</h3><p>仅 A / B / C 级参与自动派发</p><div class="desk-tags"><span v-for="v in ['A', 'B', 'C']" :key="v" class="desk-rating" :class="'rating-' + v">{{ v }}</span></div></div><el-icon><ArrowRight /></el-icon><div class="desk-card"><span class="desk-step-number">02</span><h3>双条件匹配</h3><p>采购地域 <strong>AND</strong> 映射后的业务品类</p><span class="desk-rule-condition">地域匹配 ∩ 品类匹配</span></div><el-icon><ArrowRight /></el-icon><div class="desk-card"><span class="desk-step-number">03</span><h3>创建销售任务</h3><p>仅匹配启用人员，避免重复派发</p><span class="desk-status green">记录来源与派发轨迹</span></div></div>
          <div class="desk-info-banner"><el-icon><Setting /></el-icon><div><strong>自动与人工，分工明确</strong><span>D 级、未评级与匹配失败线索进入待处理池；人工派发不限制地域和品类匹配，但不能越过账号授权或重复创建销售任务。</span></div></div>
          <div class="desk-card desk-mapping-card"><div class="desk-card-heading"><div><h3>演示分类映射</h3><p>显式标签映射，不以关键词猜测；保存后可手动触发自动派发</p></div><el-button :icon="Plus" @click="rulesDraft.push({ raw: '', category: '' })">新增映射</el-button></div><div class="desk-mapping-header"><span>Excel 演示分类标签</span><span></span><span>标准业务品类</span><span>操作</span></div><div v-for="(rule, index) in rulesDraft" :key="index" class="desk-mapping-row"><el-input v-model="rule.raw" placeholder="例如：演示分类 A" /><el-icon><ArrowRight /></el-icon><el-select v-model="rule.category" placeholder="选择标准品类"><el-option v-for="v in s.categories" :key="v" :label="v" :value="v" /></el-select><el-button link type="danger" @click="rulesDraft.splice(index, 1)">删除</el-button></div><el-empty v-if="!rulesDraft.length" description="暂无映射，请添加规则" :image-size="70" /><div class="desk-form-footer"><span>规则仅保存于当前浏览器，不连接任何后台</span><el-button type="primary" @click="saveRules">保存映射规则</el-button></div></div>
        </template>

        <template v-else-if="route.path === '/permissions'">
          <div class="desk-page-heading"><div><div class="desk-eyebrow">ACCESS CONTROL</div><h1>账号权限<span class="desk-heading-dot">.</span></h1><p>以业务品类为边界，建立清晰、可控的运营数据权限。</p></div><span class="desk-page-chip"><el-icon><Lock /></el-icon> 品类级数据隔离</span></div>
          <div class="desk-permission-roles"><div v-for="role in [{ name: '系统管理员', code: 'sys', text: '全量线索、导入、人员、规则与授权管理', icon: Setting }, { name: '业务运营', code: 'ops', text: '仅查看与派发已授权品类，人员名录只读', icon: OfficeBuilding }, { name: '销售人员', code: 'sales', text: '使用移动工作台，仅访问自己的销售任务', icon: Iphone }]" :key="role.code" class="desk-card"><el-icon><component :is="role.icon" /></el-icon><div><h3>{{ role.name }}<span>{{ s.state.accounts.filter((a: any) => a.role === role.code).length }} 个账号</span></h3><p>{{ role.text }}</p></div></div></div>
          <div class="desk-card"><div class="desk-card-heading"><div><h3>运营账号品类授权</h3><p>每个账号单独保存；撤销授权后，相应线索立即不可见、不可派发</p></div><span class="desk-subtle-tag">{{ opsAccounts.length }} 个运营账号</span></div><div class="desk-grants-header"><span>运营账号</span><span>可管理业务品类</span><span>操作</span></div><div v-for="account in opsAccounts" :key="account.id" class="desk-grants-row"><div class="desk-person-cell"><span class="desk-avatar">{{ account.name.slice(0, 1) }}</span><div><strong>{{ account.name }}</strong><small>{{ account.id }}</small></div></div><el-checkbox-group v-model="grants[account.id]"><el-checkbox v-for="v in s.categories" :key="v" :label="v" :value="v">{{ v }}</el-checkbox></el-checkbox-group><el-button type="primary" plain @click="saveGrant(account)">保存授权</el-button></div></div>
        </template>

        <template v-else-if="route.path === '/mobile'">
          <div class="desk-page-heading"><div><div class="desk-eyebrow">ANYWHERE, CONNECTED</div><h1>移动工作台<span class="desk-heading-dot">.</span></h1><p>把商机带到现场，将每一次跟进及时记录。</p></div></div>
          <div class="desk-mobile-layout"><div class="desk-mobile-intro"><span class="desk-prototype">H5 COMPANION</span><h2>销售的下一步，<br>就在手边。</h2><p>认领线索、接收任务、更新进展、记录订单。<br>一部手机，连接业务协同的最后一公里。</p><div v-for="(text, index) in ['自己的任务，清晰可见', '跟进状态与备注，实时留痕', '任务与签约主体，一一关联']" :key="text" class="desk-mobile-feature"><span>{{ String(index + 1).padStart(2, '0') }}</span>{{ text }}<el-icon><Check /></el-icon></div><a :href="router.resolve('/h5').href" target="_blank" rel="noopener noreferrer" class="desk-mobile-link">打开移动工作台 <el-icon><ArrowRight /></el-icon></a><div class="desk-mobile-note"><el-icon><User /></el-icon><span>请在右上角切换为销售演示账号。销售账号将直接进入移动工作台；移动端与 PC 共用当前账号和本地演示数据。</span></div></div><div class="desk-phone-area"><div class="desk-phone"><div class="desk-phone-camera"></div><iframe title="移动工作台演示预览" :src="router.resolve('/h5').href"></iframe></div><span class="desk-phone-caption">演示 H5 页面 · 同源本地预览</span></div></div>
        </template>

        <footer class="desk-footer"><span><span class="desk-footer-dot"></span> YL Dispatch · 公开演示 <span class="desk-footer-divider">|</span> 非生产系统，仅使用合成信息</span><el-button v-if="s.isSys" link :icon="Refresh" @click="resetDemo">重置演示数据</el-button></footer>
      </main>
    </div>

    <el-drawer v-model="detailOpen" size="720px" title="线索详情" class="desktop-app desk-detail-drawer" append-to-body>
      <template v-if="detail && !restricted && s.canManage(detail)">
        <div class="desk-detail-top"><div class="desk-tags"><span class="desk-detail-id">{{ detail.id }}</span><span class="desk-rating" :class="'rating-' + (detail.rating || '未评级')">{{ detail.rating || '未评级' }}</span><span class="desk-status" :class="statusClass(s.leadStatus(detail))">{{ s.leadStatus(detail) }}</span></div><h2>{{ detail.title }}</h2><div class="desk-tags"><span v-for="v in detail.categories" :key="v" class="desk-category-tag">{{ v }}</span></div><el-button v-if="s.canManage(detail)" type="primary" :icon="User" @click="beginAssign([detail])">派发给销售</el-button></div>
        <el-tabs><el-tab-pane label="演示信息"><div class="desk-detail-fields"><div v-for="[key, label] in demoFields" :key="key" class="desk-detail-field" :class="{ wide: ['contact', 'ratingReason', 'summary'].includes(key!) }"><span>{{ label }}</span><p>{{ detail[key!] || '—' }}</p></div></div><div v-if="detail.pendingReason" class="desk-info-banner"><el-icon><Clock /></el-icon><div><strong>待处理原因</strong><span>{{ detail.pendingReason }}</span></div></div></el-tab-pane><el-tab-pane :label="`销售任务（${s.leadTasks(detail.id).length}）`"><el-empty v-if="!s.leadTasks(detail.id).length" description="尚未派发销售任务" :image-size="90" /><div v-for="task in s.leadTasks(detail.id)" :key="task.id" class="desk-task-card"><div class="desk-task-header"><div class="desk-person-cell"><span class="desk-avatar">{{ s.personName(task.salesId).slice(0, 1) }}</span><div><strong>{{ s.personName(task.salesId) }}</strong><small>{{ task.entity }}</small></div></div><span class="desk-status" :class="statusClass(task.status)">{{ task.status }}</span></div><div class="desk-task-meta">{{ ({ auto: '自动派发', manual: '人工派发', claim: '自主认领' } as Record<string, string>)[task.source] }} · {{ task.createdAt }}<br>最近更新：{{ task.updatedAt }}</div><div class="desk-task-notes"><span>跟进备注</span><p>{{ task.notes || '暂无跟进备注' }}</p></div><div class="desk-task-notes"><span>关联订单</span><div class="desk-tags"><span v-for="(order, index) in task.orders" :key="index" class="desk-category-tag">{{ order }}</span><span v-if="!task.orders.length" class="desk-muted">暂无关联订单</span></div></div><h4>跟进时间线</h4><el-timeline><el-timeline-item v-for="(event, index) in task.events" :key="index" :timestamp="event.at" color="#2b66ed">{{ event.text }}</el-timeline-item></el-timeline></div></el-tab-pane></el-tabs>
      </template>
    </el-drawer>

    <el-dialog v-model="assignOpen" title="派发销售任务" width="680px" class="desktop-app desk-dialog" append-to-body>
      <p class="desk-dialog-description">将 <strong>{{ assignIds.length }}</strong> 条线索派发给所选销售；每条线索为每名销售创建独立任务。</p><div class="desk-dialog-info">人工派发可跨地域、跨品类。已存在任务的销售不再列出；停用人员不可选。</div><el-input v-model="salesSearch" :prefix-icon="Search" placeholder="搜索销售姓名 / 地域 / 品类" clearable /><el-checkbox-group v-model="salesIds" class="desk-sales-options"><el-checkbox v-for="person in eligible" :key="person.id" :value="person.id" :label="person.id"><div class="desk-sales-option"><div><strong>{{ person.name }}</strong><span>{{ person.region }} · {{ person.entity }}</span></div><small>{{ person.categories.join(' / ') }}</small></div></el-checkbox></el-checkbox-group><el-empty v-if="!eligible.length" description="暂无可派发销售，请检查已有任务或搜索条件" :image-size="70" /><template #footer><span class="desk-dialog-footer-note">已选 {{ salesIds.length }} 名销售 · 预计 {{ assignIds.length * salesIds.length }} 个任务</span><el-button @click="assignOpen = false">取消</el-button><el-button type="primary" :disabled="!salesIds.length || restricted" @click="confirmAssign">确认派发</el-button></template>
    </el-dialog>

    <el-dialog v-if="s.isSys" v-model="previewOpen" title="导入预览与校验" width="860px" class="desktop-app desk-dialog" append-to-body>
      <div class="desk-preview-file"><el-icon><Tickets /></el-icon>{{ importName }}<span>首个工作表</span></div><div class="desk-preview-stats"><div><strong>{{ validation.valid.length + validation.errors.length }}</strong><span>校验数据行</span></div><div><strong class="desk-success-text">{{ validation.valid.length }}</strong><span>可导入业务线索</span></div><div><strong class="desk-warning-text">{{ validation.errors.length }}</strong><span>失败 / 说明行</span></div></div><el-alert title="仅导入虚构演示信息。此处仅做只读校验；确认后才写入本地数据，失败行不会进入业务线索。" type="info" :closable="false" show-icon /><el-tabs class="desk-preview-tabs"><el-tab-pane :label="`有效数据（${validation.valid.length}）`"><el-table :data="validation.valid.slice(0, 50)" max-height="330"><el-table-column prop="title" label="线索名称" min-width="340" /><el-table-column prop="region" label="地域" width="140" /><el-table-column prop="rawCategory" label="演示分类" width="150" /><el-table-column prop="rating" label="评级" width="70" /></el-table><p class="desk-muted">最多预览前 50 条，确认将导入全部通过校验的数据。</p></el-tab-pane><el-tab-pane :label="`校验失败（${validation.errors.length}）`"><el-table :data="validation.errors" max-height="330"><el-table-column prop="row" label="Excel 行号" width="100" /><el-table-column prop="title" label="演示标题" min-width="220" /><el-table-column prop="reason" label="失败原因" min-width="230" /></el-table></el-tab-pane></el-tabs><template #footer><el-button :icon="Download" :disabled="!validation.errors.length || !s.isSys" @click="exportPreviewFailures">下载校验失败清单</el-button><el-button @click="previewOpen = false">取消，不导入</el-button><el-button type="primary" :loading="importing" :disabled="!validation.valid.length || !s.isSys" @click="confirmImport">确认导入 {{ validation.valid.length }} 条</el-button></template>
    </el-dialog>

    <el-dialog v-if="s.isSys" v-model="historyOpen" title="导入记录详情" width="800px" class="desktop-app desk-dialog" append-to-body><template v-if="historyDetail"><div class="desk-preview-file">{{ historyDetail.name }}</div><p class="desk-muted">{{ historyDetail.at }} · 总计 {{ historyDetail.total }} 行 · 有效 {{ historyDetail.valid }} 行 · 失败 {{ historyDetail.failed }} 行</p><el-table :data="historyDetail.errors" max-height="400" empty-text="所有数据均通过校验"><el-table-column prop="row" label="Excel 行号" width="100" /><el-table-column prop="title" label="演示标题" min-width="220" /><el-table-column prop="reason" label="失败原因" min-width="230" /></el-table></template><template #footer><el-button @click="historyOpen = false">关闭</el-button><el-button type="primary" :icon="Download" :disabled="!historyDetail?.failed || !s.isSys" @click="exportFailures(historyDetail)">下载失败清单 XLSX</el-button></template></el-dialog>

    <el-dialog v-model="personOpen" :title="s.state.people.some((p: any) => p.id === personForm.id) ? '编辑销售人员' : '新增合成销售人员'" width="680px" class="desktop-app desk-dialog" append-to-body><el-alert title="请仅填写合成演示信息，不录入真实个人资料。" type="info" :closable="false" show-icon /><el-form label-position="top" class="desk-person-form"><div class="desk-form-grid"><el-form-item label="销售姓名" required><el-input v-model="personForm.name" placeholder="合成姓名" /></el-form-item><el-form-item label="演示联系人（固定标记）"><el-input v-model="personForm.phone" placeholder="演示联系人，无真实联系方式" readonly /></el-form-item><el-form-item label="所属公司"><el-input v-model="personForm.company" placeholder="虚构演示公司" /></el-form-item><el-form-item label="所属部门"><el-input v-model="personForm.department" placeholder="虚构演示部门" /></el-form-item><el-form-item label="地域匹配字段" required><el-input v-model="personForm.region" placeholder="例如：演示区域-演示城区" /></el-form-item><el-form-item label="签约主体" required><el-input v-model="personForm.entity" placeholder="演示签约公司" /></el-form-item></div><el-form-item label="五段地域描述（可输入自定义标签，最多五项）"><el-select v-model="personForm.segments" multiple filterable allow-create default-first-option :multiple-limit="5" placeholder="选择或输入演示地域描述"><el-option v-for="v in segmentOptions" :key="v" :label="v" :value="v" /></el-select></el-form-item><el-form-item label="业务品类"><el-checkbox-group v-model="personForm.categories"><el-checkbox v-for="v in s.categories" :key="v" :label="v" :value="v">{{ v }}</el-checkbox></el-checkbox-group></el-form-item><div class="desk-form-grid"><el-form-item label="模拟账号标识"><el-input v-model="personForm.wecomId" placeholder="虚构演示标识" /></el-form-item><el-form-item label="人员状态"><el-switch v-model="personForm.enabled" active-text="启用" inactive-text="停用" /></el-form-item></div></el-form><template #footer><el-button @click="personOpen = false">取消</el-button><el-button type="primary" :disabled="!s.isSys" @click="savePerson">保存人员信息</el-button></template></el-dialog>
  </div>
</template>
