import { createRouter, createWebHistory } from 'vue-router';
const PianoView = () => import('../views/PianoView.vue');
const ChordLabView = () => import('../views/ChordLabView.vue');

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/piano' },
    { path: '/piano', name: 'piano', component: PianoView },
    { path: '/chord-lab', name: 'chord-lab', component: ChordLabView },
  ],
});

export default router;
