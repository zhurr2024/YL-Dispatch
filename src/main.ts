import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import './styles/base.css'

const desktop = () => import('./views/Desktop.vue')
const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/overview' },
    ...['overview', 'leads', 'pending', 'imports', 'team', 'rules', 'permissions', 'mobile'].map(name => ({ path: `/${name}`, component: desktop })),
    { path: '/h5', component: () => import('./views/Mobile.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/overview' },
  ],
})
createApp(App).use(router).use(ElementPlus, { locale: zhCn }).mount('#app')
