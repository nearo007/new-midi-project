import { createRouter, createWebHistory } from 'vue-router';
import PianoView from '../views/PianoView.vue';
import ChordLabView from '../views/ChordLabView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/piano' },
    { path: '/piano', name: 'piano', component: PianoView },
    { path: '/chord-lab', name: 'chord-lab', component: ChordLabView },
  ],
});

export default router;
