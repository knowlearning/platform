import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import Agent from '@knowlearning/agent'

window.Agent = Agent

createApp(App).mount('#app')
