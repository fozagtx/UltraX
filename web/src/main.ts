import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

document.documentElement.classList.add('js')

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
