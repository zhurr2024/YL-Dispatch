<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  ActionSheet, Button, Empty, Field, Icon, Popup, Tab, Tabbar, TabbarItem,
  Tabs, Tag, closeDialog, closeToast, showConfirmDialog, showToast,
} from 'vant'
import 'vant/lib/index.css'
import '../styles/mobile.css'
import { useStore } from '../store'

const s = useStore()
const route = useRoute()
type Store = ReturnType<typeof useStore>
type Task = ReturnType<Store['claim']>
type Lead = NonNullable<ReturnType<Store['getLead']>>
const page = ref('tasks')
const taskTab = ref('pending')
const poolTab = ref('available')
const taskSearch = ref('')
const poolSearch = ref('')
const accountSheet = ref(false)
const detailOpen = ref(false)
const selectedTaskId = ref('')
const selectedLeadId = ref('')
const rejectionOpen = ref(false)
const rejectionReason = ref('')
const feedbackStatus = ref('跟进中')
const feedbackNotes = ref('')
const feedbackOrders = ref('')
const saving = ref(false)
let operationVersion = 0
const feedbackOptions = ['跟进中', '还在沟通', '确认中', '中标', '未中标', '已放弃']
const endedStatuses = ['中标', '未中标', '已放弃', '已拒绝', '已退回', '拒绝']
const isSales = computed(() => s.account.role === 'sales')
const person = computed(() => isSales.value
  ? s.state.people.find(p => p.id === s.account.personId)
  : undefined)
const mine = computed(() => isSales.value ? s.myTasks : [])
const claims = computed(() => isSales.value ? s.myClaims : [])
const available = computed(() => isSales.value ? s.pool : [])
const selectedTask = computed(() => {
  if (!isSales.value || !selectedTaskId.value) return undefined
  return [...mine.value, ...claims.value].find(t => t.id === selectedTaskId.value)
})
const selectedLead = computed(() => {
  if (!isSales.value) return undefined
  if (selectedTaskId.value) return selectedTask.value ? s.getLead(selectedTask.value.leadId) : undefined
  return available.value.find(l => l.id === selectedLeadId.value)
})
const claimContext = computed(() => !selectedTask.value || selectedTask.value.source === 'claim')
const isPending = (task: Task) => task.status === '待接收'
const isEnded = (task: Task) => endedStatuses.includes(task.status)
const isRejected = (task: Task) => ['已拒绝', '已退回', '拒绝'].includes(task.status)
const taskGroups = computed(() => [
  { name: 'pending', title: '待接收', count: mine.value.filter(isPending).length },
  { name: 'active', title: '跟进中', count: mine.value.filter(t => !isPending(t) && !isEnded(t)).length },
  { name: 'ended', title: '已结束', count: mine.value.filter(isEnded).length },
])
function matches(lead: Lead | undefined, query: string, task?: Task) {
  const word = query.trim().toLocaleLowerCase()
  if (!word) return true
  return [lead?.title, lead?.buyer, lead?.region, lead?.serial, lead?.bidNumber,
    ...(lead?.categories ?? []), task?.status, task?.notes, ...(task?.orders ?? [])]
    .filter(Boolean).join(' ').toLocaleLowerCase().includes(word)
}
const visibleTasks = computed(() => mine.value.filter(t => {
  const inTab = taskTab.value === 'pending' ? isPending(t)
    : taskTab.value === 'ended' ? isEnded(t) : !isPending(t) && !isEnded(t)
  return inTab && matches(s.getLead(t.leadId), taskSearch.value, t)
}))
const visiblePool = computed(() => available.value.filter(l => matches(l, poolSearch.value)))
const visibleClaims = computed(() => claims.value.filter(t => matches(s.getLead(t.leadId), poolSearch.value, t)))
const accountActions = computed(() => s.salesAccounts.map(account => ({
  name: account.name,
  subname: `模拟销售身份 · ${account.id === s.account.id ? '当前使用' : '点击切换'}`,
  accountId: account.id,
  color: account.id === s.account.id ? '#16856b' : undefined,
})))
const leadFields = computed(() => {
  const lead = selectedLead.value
  if (!lead) return []
  const fields: { label: string; value: unknown }[] = [
    { label: '线索编号', value: lead.serial },
    { label: '项目名称', value: lead.title },
    { label: '演示发布日期', value: lead.publishedAt },
    { label: '采购单位', value: lead.buyer },
    { label: '项目地区', value: lead.region },
    { label: '演示分类', value: lead.rawCategory },
    { label: '业务品类', value: lead.categories.join('、') },
    { label: '项目预算', value: lead.budget },
    { label: '招标编号', value: lead.bidNumber },
    { label: '演示截止日期', value: lead.deadline },
    { label: '演示联系信息', value: lead.contact },
    { label: '演示渠道', value: lead.channel },
    { label: '演示摘要', value: lead.summary },
    { label: '演示入库时间', value: lead.createdAt },
  ]
  // 自主认领链路不呈现评级或运营提醒，包含详情页。
  if (!claimContext.value) {
    fields.push(
      { label: '商机评级', value: lead.rating },
      { label: '评级说明', value: lead.ratingReason },
      { label: '运营备注', value: lead.pendingReason },
    )
  }
  return fields
})
function text(value: unknown) {
  return value === undefined || value === null || value === '' ? '未提供' : String(value)
}
function shortDate(value: string) {
  return value ? value.replace('T', ' ').slice(0, 16) : '未提供'
}
function sourceName(task: Task) {
  return task.source === 'auto' ? '自动分派' : task.source === 'manual' ? '人工分派' : '自主认领'
}
function statusType(status: string): 'primary' | 'success' | 'warning' | 'danger' | 'default' {
  if (status === '待接收') return 'warning'
  if (status === '中标') return 'success'
  if (endedStatuses.includes(status)) return 'default'
  return 'primary'
}
function errorToast(error: unknown) {
  showToast(error instanceof Error ? error.message : '操作未完成，请重试')
}
function switchSales(action: { accountId?: string }) {
  if (!action.accountId) return
  try {
    s.switchAccount(action.accountId)
    accountSheet.value = false
    showToast('已切换模拟销售身份')
  } catch (error) { errorToast(error) }
}
function openTask(task: Task) {
  if (!isSales.value) return
  selectedTaskId.value = task.id
  selectedLeadId.value = task.leadId
  feedbackStatus.value = feedbackOptions.includes(task.status) ? task.status : '跟进中'
  feedbackNotes.value = task.notes ?? ''
  feedbackOrders.value = task.orders.join('\n')
  rejectionOpen.value = false
  rejectionReason.value = ''
  detailOpen.value = true
}
function openLead(lead: Lead) {
  if (!isSales.value || !available.value.some(item => item.id === lead.id)) return
  selectedTaskId.value = ''
  selectedLeadId.value = lead.id
  rejectionOpen.value = false
  detailOpen.value = true
}
async function claimLead(lead: Lead) {
  if (saving.value || !isSales.value) return
  saving.value = true
  const version = ++operationVersion
  const accountId = s.account.id
  try {
    await showConfirmDialog({
      title: '认领这条商机？',
      message: `「${lead.title}」\n认领后直接进入跟进中，可记录合成演示反馈。`,
      confirmButtonText: '确认认领',
      confirmButtonColor: '#16856b',
    })
    if (version !== operationVersion || !isSales.value || s.account.id !== accountId) {
      showToast('身份已变化，请重新操作')
      return
    }
    const task = s.claim(lead.id)
    page.value = 'pool'
    poolTab.value = 'mine'
    openTask(task)
    showToast('认领成功，开始跟进吧')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') errorToast(error)
  } finally { if (version === operationVersion) saving.value = false }
}
function respond(accept: boolean) {
  const task = selectedTask.value
  if (!task || saving.value) return
  if (!accept && !rejectionReason.value.trim()) {
    showToast('请填写拒绝原因')
    return
  }
  saving.value = true
  try {
    s.respond(task.id, accept, accept ? '' : rejectionReason.value.trim())
    rejectionOpen.value = false
    if (accept) {
      feedbackStatus.value = '跟进中'
      taskTab.value = 'active'
    } else {
      detailOpen.value = false
    }
    showToast(accept ? '已接收，请及时跟进' : '已退回运营，其他销售任务不受影响')
  } catch (error) { errorToast(error) }
  finally { saving.value = false }
}
function saveFeedback() {
  const task = selectedTask.value
  if (!task || saving.value) return
  const orders = feedbackOrders.value.split(/[\n,，;；]+/).map(order => order.trim()).filter(Boolean)
  if (new Set(orders).size !== orders.length) {
    showToast('销售订单号不能重复')
    return
  }
  if (feedbackStatus.value === '中标' && !orders.length) {
    showToast('中标时请至少填写一个销售订单号')
    return
  }
  saving.value = true
  try {
    s.feedback(task.id, feedbackStatus.value, feedbackNotes.value.trim(), orders)
    if (task.source !== 'claim') taskTab.value = isEnded(task) ? 'ended' : 'active'
    showToast('跟进反馈已保存')
  } catch (error) { errorToast(error) }
  finally { saving.value = false }
}
watch([() => s.account.id, () => s.account.role, () => s.account.personId], () => {
  operationVersion++
  saving.value = false
  closeDialog()
  closeToast()
  detailOpen.value = false
  accountSheet.value = false
  selectedTaskId.value = ''
  selectedLeadId.value = ''
  taskSearch.value = ''
  poolSearch.value = ''
  rejectionReason.value = ''
  feedbackNotes.value = ''
  feedbackOrders.value = ''
  page.value = 'tasks'
  taskTab.value = 'pending'
  poolTab.value = 'available'
}, { flush: 'sync' })
onMounted(() => {
  const queryAccount = route.query.account
  const id = Array.isArray(queryAccount) ? queryAccount[0] : queryAccount
  if (id && s.salesAccounts.some(account => account.id === id)) {
    try { s.switchAccount(id) } catch (error) { errorToast(error) }
  }
})
</script>

<template>
  <div class="mobile-app">
    <div class="mobile-shell">
      <header class="mobile-header">
        <div class="mobile-brand"><span class="mobile-brand-icon">YL</span><div><strong>YL Dispatch</strong><span>公开演示 · 移动工作台</span></div></div>
        <button class="mobile-account-button" aria-label="切换模拟销售身份" @click="accountSheet = true">
          <Icon name="exchange" /><span>切换身份</span>
        </button>
      </header>

      <main v-if="!isSales" class="mobile-welcome">
        <div class="mobile-welcome-art"><Icon name="shield-o" /><span class="mobile-art-dot"></span></div>
        <span class="mobile-eyebrow">YL DISPATCH · PUBLIC DEMO</span>
        <h1>让每一次商机<br />都有下一步</h1>
        <p>接收任务、认领商机、同步跟进。<br />你的移动销售工作台，随时在线。</p>
        <div class="mobile-gate-note"><Icon name="lock" /><div><strong>当前为{{ s.account.role === 'sys' ? '系统管理员' : '运营' }}身份</strong><span>移动端仅向销售展示本人业务数据，请选择模拟销售身份后进入。</span></div></div>
        <Button type="primary" block round icon="user-circle-o" @click="accountSheet = true">选择模拟销售身份</Button>
        <div class="mobile-demo-note">演示日期：2026-10-10 · 全部人员为合成数据<br />身份与电脑端共享，切换后电脑端也会同步</div>
        <div class="mobile-welcome-features"><span><Icon name="todo-list-o" />任务协同</span><span><Icon name="aim" />商机认领</span><span><Icon name="passed" />过程留痕</span></div>
      </main>

      <template v-else>
        <main class="mobile-main">
          <section v-if="page === 'tasks'" class="mobile-page">
            <div class="mobile-page-heading"><div><span class="mobile-eyebrow">MY WORKSPACE</span><h1>我的任务</h1></div><span class="mobile-date"><Icon name="calendar-o" />演示日期：2026-10-10</span></div>
            <div class="mobile-work-banner"><div><span>{{ person?.name || s.account.name }}，工作顺利</span><strong>{{ taskGroups[0]?.count || 0 }} <small>项任务等待接收</small></strong><p>每一个及时响应，都离成交更近一步</p></div><Icon name="todo-list-o" /></div>
            <div class="mobile-search"><Icon name="search" /><input v-model="taskSearch" aria-label="搜索我的任务" placeholder="搜索项目、采购单位、地区或订单号" /><button v-if="taskSearch" aria-label="清空任务搜索" @click="taskSearch = ''"><Icon name="clear" /></button></div>
            <Tabs v-model:active="taskTab" class="mobile-tabs" color="#16856b" shrink>
              <Tab v-for="group in taskGroups" :key="group.name" :name="group.name" :title="`${group.title} ${group.count}`" />
            </Tabs>
            <div class="mobile-list-caption"><span>{{ taskSearch ? '搜索结果' : '我的分派任务' }}</span><span>{{ visibleTasks.length }} 项</span></div>
            <div class="mobile-card-list">
              <article v-for="task in visibleTasks" :key="task.id" class="mobile-lead-card" tabindex="0" role="button" :aria-label="`查看任务：${s.getLead(task.leadId)?.title || task.leadId}`" @click="openTask(task)" @keydown.enter="openTask(task)" @keydown.space.prevent="openTask(task)">
                <div class="mobile-card-top"><span class="mobile-source">{{ sourceName(task) }}</span><Tag :type="statusType(task.status)" plain round>{{ task.status }}</Tag></div>
                <h2>{{ s.getLead(task.leadId)?.title || '演示线索暂不可用' }}</h2>
                <p class="mobile-buyer"><Icon name="hotel-o" />{{ s.getLead(task.leadId)?.buyer || '采购单位未提供' }}</p>
                <div class="mobile-category-tags"><span v-for="category in s.getLead(task.leadId)?.categories || []" :key="category">{{ category }}</span></div>
                <div class="mobile-card-facts"><div><span>项目预算</span><strong>{{ text(s.getLead(task.leadId)?.budget) }}</strong></div><div><span>项目地区</span><strong>{{ text(s.getLead(task.leadId)?.region) }}</strong></div></div>
                <div class="mobile-card-footer"><span><Icon name="clock-o" />截止 {{ text(s.getLead(task.leadId)?.deadline) }}</span><span class="mobile-card-link">{{ isPending(task) ? '去接收' : '查看跟进' }}<Icon name="arrow" /></span></div>
              </article>
              <Empty v-if="!visibleTasks.length" image="search" :description="taskSearch ? '没有匹配的任务，试试其他关键词' : '这里暂时没有任务'" />
            </div>
          </section>

          <section v-else-if="page === 'pool'" class="mobile-page">
            <div class="mobile-page-heading"><div><span class="mobile-eyebrow">OPPORTUNITY POOL</span><h1>商机池</h1></div><span class="mobile-heading-icon"><Icon name="aim" /></span></div>
            <div class="mobile-pool-banner"><strong>发现新机会，主动向前一步</strong><p>演示日期前一个月的合成商机 · 不限业务品类</p><span><Icon name="passed" />认领即进入跟进，个人不可重复认领</span></div>
            <div class="mobile-search"><Icon name="search" /><input v-model="poolSearch" aria-label="搜索商机或我的认领" placeholder="搜索项目、采购单位、地区或品类" /><button v-if="poolSearch" aria-label="清空商机搜索" @click="poolSearch = ''"><Icon name="clear" /></button></div>
            <Tabs v-model:active="poolTab" class="mobile-tabs" color="#16856b">
              <Tab name="available" :title="`可认领 ${available.length}`" />
              <Tab name="mine" :title="`我的认领 ${claims.length}`" />
            </Tabs>
            <div class="mobile-list-caption"><span>{{ poolTab === 'available' ? '开放商机 · 自主选择' : '我的认领 · 持续跟进' }}</span><span>{{ poolTab === 'available' ? visiblePool.length : visibleClaims.length }} 项</span></div>
            <div v-if="poolTab === 'available'" class="mobile-card-list">
              <article v-for="lead in visiblePool" :key="lead.id" class="mobile-lead-card">
                <div class="mobile-card-top"><span class="mobile-source">合成演示商机</span><span class="mobile-published">演示发布：{{ lead.publishedAt }}</span></div>
                <button class="mobile-title-button" @click="openLead(lead)"><h2>{{ lead.title }}</h2></button>
                <p class="mobile-buyer"><Icon name="hotel-o" />{{ text(lead.buyer) }}</p>
                <div class="mobile-category-tags"><span v-for="category in lead.categories" :key="category">{{ category }}</span></div>
                <div class="mobile-card-facts"><div><span>项目预算</span><strong>{{ text(lead.budget) }}</strong></div><div><span>项目地区</span><strong>{{ text(lead.region) }}</strong></div></div>
                <div class="mobile-card-deadline"><Icon name="clock-o" />截止 {{ text(lead.deadline) }}</div>
                <div class="mobile-pool-actions"><Button size="small" plain round @click="openLead(lead)">查看详情</Button><Button type="primary" size="small" round :loading="saving" @click="claimLead(lead)">认领商机<Icon name="arrow" /></Button></div>
              </article>
              <Empty v-if="!visiblePool.length" image="search" :description="poolSearch ? '没有匹配的商机，试试其他关键词' : '暂时没有可认领商机'" />
            </div>
            <div v-else class="mobile-card-list">
              <article v-for="task in visibleClaims" :key="task.id" class="mobile-lead-card" role="button" tabindex="0" :aria-label="`查看认领：${s.getLead(task.leadId)?.title || task.leadId}`" @click="openTask(task)" @keydown.enter="openTask(task)" @keydown.space.prevent="openTask(task)">
                <div class="mobile-card-top"><span class="mobile-source">自主认领</span><Tag :type="statusType(task.status)" plain round>{{ task.status }}</Tag></div>
                <h2>{{ s.getLead(task.leadId)?.title || '演示线索暂不可用' }}</h2>
                <p class="mobile-buyer"><Icon name="hotel-o" />{{ text(s.getLead(task.leadId)?.buyer) }}</p>
                <div class="mobile-category-tags"><span v-for="category in s.getLead(task.leadId)?.categories || []" :key="category">{{ category }}</span></div>
                <div class="mobile-card-facts"><div><span>项目预算</span><strong>{{ text(s.getLead(task.leadId)?.budget) }}</strong></div><div><span>项目地区</span><strong>{{ text(s.getLead(task.leadId)?.region) }}</strong></div></div>
                <div class="mobile-card-footer"><span><Icon name="clock-o" />截止 {{ text(s.getLead(task.leadId)?.deadline) }}</span><span class="mobile-card-link">更新跟进<Icon name="arrow" /></span></div>
              </article>
              <Empty v-if="!visibleClaims.length" image="search" :description="poolSearch ? '没有匹配的认领记录' : '还没有认领，去发现第一条商机吧'" />
            </div>
          </section>

          <section v-else class="mobile-page mobile-profile">
            <div class="mobile-page-heading"><div><span class="mobile-eyebrow">MY PROFILE</span><h1>我的</h1></div><Tag plain round type="success">模拟身份</Tag></div>
            <div class="mobile-profile-card"><div class="mobile-avatar">{{ (person?.name || s.account.name).slice(-2) }}</div><h2>{{ person?.name || s.account.name }}</h2><p>{{ person?.company || '演示公司' }} · {{ person?.department || '演示团队' }}</p><span>销售 · 合成人员 / 非真实员工</span></div>
            <div class="mobile-profile-stats"><button @click="page = 'tasks'; taskTab = 'pending'"><strong>{{ taskGroups[0]?.count || 0 }}</strong><span>待接收</span></button><button @click="page = 'tasks'; taskTab = 'active'"><strong>{{ taskGroups[1]?.count || 0 }}</strong><span>跟进中</span></button><button @click="page = 'pool'; poolTab = 'mine'"><strong>{{ claims.length }}</strong><span>我的认领</span></button></div>
            <section class="mobile-section"><h3>演示销售资料</h3><dl class="mobile-info-list"><div><dt>演示联系人</dt><dd>演示联系人，无真实联系方式</dd></div><div><dt>负责地区</dt><dd>{{ text(person?.region) }}</dd></div><div><dt>业务品类</dt><dd>{{ person?.categories.join('、') || '未配置' }}</dd></div><div><dt>客户分层</dt><dd>{{ person?.segments.join('、') || '未配置' }}</dd></div><div><dt>销售主体</dt><dd>{{ text(person?.entity) }}</dd></div><div><dt>模拟账号标识</dt><dd>{{ text(person?.wecomId) }}</dd></div></dl></section>
            <button class="mobile-profile-switch" @click="accountSheet = true"><Icon name="exchange" /><span>切换模拟销售身份</span><Icon name="arrow" /></button>
            <div class="mobile-profile-notice"><Icon name="info-o" /><div><strong>本地演示 · 非生产系统</strong><p>固定演示日期：2026-10-10。数据保存在当前浏览器，无外部接口。移动端与电脑端共享账户与业务数据，切换身份会同步影响电脑端。</p></div></div>
          </section>
          <p class="mobile-page-footnote">YL Dispatch · 公开演示 · 合成信息</p>
        </main>
        <Tabbar v-model="page" class="mobile-tabbar" :fixed="false" safe-area-inset-bottom active-color="#16856b">
          <TabbarItem name="tasks" icon="todo-list-o" :badge="taskGroups[0]?.count || undefined">我的任务</TabbarItem>
          <TabbarItem name="pool" icon="apps-o">商机池</TabbarItem>
          <TabbarItem name="profile" icon="user-o">我的</TabbarItem>
        </Tabbar>
      </template>

      <ActionSheet v-model:show="accountSheet" class="mobile-account-sheet" :actions="accountActions" title="选择模拟销售身份" description="全部为合成人员；切换将同步改变电脑端账户" cancel-text="取消" teleport=".mobile-shell" @select="switchSales">
        <template v-if="!accountActions.length" #default><Empty description="暂无模拟销售账户" /></template>
      </ActionSheet>

      <Popup v-model:show="detailOpen" class="mobile-detail-popup" position="bottom" round :style="{ height: '90%' }" teleport=".mobile-shell" :close-on-click-overlay="!saving">
        <div v-if="isSales && (selectedLead || selectedTask)" class="mobile-detail">
          <header class="mobile-detail-header"><div><span>{{ claimContext ? '商机详情' : '任务详情' }}</span><Tag v-if="selectedTask" :type="statusType(selectedTask.status)" plain round>{{ selectedTask.status }}</Tag></div><button aria-label="关闭详情" @click="detailOpen = false"><Icon name="cross" /></button></header>
          <div class="mobile-detail-scroll">
            <div class="mobile-detail-hero"><span class="mobile-eyebrow">{{ selectedTask ? sourceName(selectedTask) : '合成演示商机 · 自主认领' }}</span><h2>{{ selectedLead?.title || '演示线索暂不可用' }}</h2><p>{{ text(selectedLead?.buyer) }}</p><div class="mobile-category-tags"><span v-for="category in selectedLead?.categories || []" :key="category">{{ category }}</span></div></div>
            <section class="mobile-section"><h3><Icon name="description-o" />演示线索信息</h3><dl class="mobile-info-list"><div v-for="field in leadFields" :key="field.label"><dt>{{ field.label }}</dt><dd>{{ text(field.value) }}</dd></div></dl><Empty v-if="!selectedLead" description="演示线索暂不可用" /></section>
            <template v-if="selectedTask">
              <section class="mobile-section"><h3><Icon name="user-o" />我的任务信息</h3><dl class="mobile-info-list"><div><dt>任务编号</dt><dd>{{ selectedTask.id }}</dd></div><div><dt>所属销售</dt><dd>{{ s.personName(selectedTask.salesId) }}</dd></div><div><dt>销售主体</dt><dd>{{ text(selectedTask.entity) }}</dd></div><div><dt>创建时间</dt><dd>{{ shortDate(selectedTask.createdAt) }}</dd></div><div><dt>更新时间</dt><dd>{{ shortDate(selectedTask.updatedAt) }}</dd></div><div><dt>我的备注</dt><dd>{{ selectedTask.notes || '暂无跟进备注' }}</dd></div><div><dt>销售订单</dt><dd>{{ selectedTask.orders.join('\n') || '暂未关联订单' }}</dd></div></dl></section>
              <section v-if="isPending(selectedTask)" class="mobile-section">
                <h3>接收任务</h3><p class="mobile-form-hint">请确认是否能够跟进该项目。拒绝时需说明原因，线索将返回运营待处理。</p>
                <template v-if="rejectionOpen"><Field v-model="rejectionReason" type="textarea" rows="3" maxlength="500" show-word-limit placeholder="例如：项目地区不在服务范围，请重新分派" label="拒绝原因" required /><div class="mobile-inline-actions"><Button plain round @click="rejectionOpen = false">取消拒绝</Button><Button type="danger" round :loading="saving" @click="respond(false)">确认拒绝</Button></div></template>
                <div v-else class="mobile-inline-actions"><Button plain round @click="rejectionOpen = true">拒绝任务</Button><Button type="primary" round :loading="saving" @click="respond(true)">接收并跟进</Button></div>
              </section>
              <section v-else-if="!isRejected(selectedTask)" class="mobile-section">
                <h3><Icon name="edit" />更新跟进反馈</h3><p class="mobile-form-hint">仅更新你本人的任务，不影响其他销售的跟进记录。</p>
                <div class="mobile-status-options"><button v-for="status in feedbackOptions" :key="status" :class="{ 'is-selected': feedbackStatus === status }" :aria-pressed="feedbackStatus === status" @click="feedbackStatus = status">{{ status }}<Icon v-if="feedbackStatus === status" name="success" /></button></div>
                <Field v-model="feedbackNotes" label="演示跟进备注" type="textarea" rows="3" maxlength="2000" show-word-limit placeholder="仅记录合成演示沟通、项目进度与下一步计划" />
                <Field v-model="feedbackOrders" label="演示订单号" type="textarea" rows="3" :required="feedbackStatus === '中标'" placeholder="仅填虚构订单号，按换行或逗号分隔" />
                <p class="mobile-form-hint">中标必须关联至少一个订单号，订单号不可重复。</p>
                <Button block round type="primary" :loading="saving" @click="saveFeedback">保存跟进反馈</Button>
              </section>
              <section class="mobile-section"><h3><Icon name="clock-o" />任务动态</h3><ol class="mobile-timeline"><li v-for="(event, index) in selectedTask.events" :key="`${event.at}-${index}`"><span>{{ shortDate(event.at) }}</span><p>{{ event.text }}</p></li></ol><p v-if="!selectedTask.events.length" class="mobile-form-hint">暂无任务动态</p></section>
            </template>
          </div>
          <footer v-if="!selectedTask && selectedLead" class="mobile-detail-footer"><div><strong>体验合成商机跟进</strong><span>认领后即可记录演示反馈</span></div><Button type="primary" round :loading="saving" @click="claimLead(selectedLead)">认领商机</Button></footer>
        </div>
      </Popup>
    </div>
  </div>
</template>
