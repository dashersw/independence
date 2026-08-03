import type { Track } from './types'

const telegraph = new URL('../../assets/landing-telegraph.jpg', import.meta.url).href
const bosphorus = new URL('../../assets/landing-bosphorus.jpg', import.meta.url).href
const samsun = new URL('../../assets/landing-samsun.jpg', import.meta.url).href
const warroom = new URL('../../assets/landing-warroom.jpg', import.meta.url).href
const soldier = new URL('../../assets/landing-soldier.jpg', import.meta.url).href
const supply = new URL('../../assets/landing-supply.jpg', import.meta.url).href
const trench = new URL('../../assets/landing-trench.jpg', import.meta.url).href
const ridge = new URL('../../assets/landing-ridge.jpg', import.meta.url).href
const deck = new URL('../../assets/landing-deck.jpg', import.meta.url).href
const westmap = new URL('../../assets/landing-westmap.jpg', import.meta.url).href
const hall = new URL('../../assets/landing-hall.jpg', import.meta.url).href
const voyage = new URL('../../assets/landing-voyage.jpg', import.meta.url).href
const dawn = new URL('../../assets/landing-hero.jpg', import.meta.url).href

export const TRACKS: Track[] = [
  {
    title: 'The First Shot',
    src: new URL('../../assets/music/the-first-shot.mp3', import.meta.url).href,
    art: telegraph,
    pos: '30% 50%',
  },
  {
    title: 'A Nation in Chains',
    src: new URL('../../assets/music/a-nation-in-chains.mp3', import.meta.url).href,
    art: bosphorus,
    pos: '18% 40%',
  },
  {
    title: 'Rise of the Resistance',
    src: new URL('../../assets/music/rise-of-the-resistance.mp3', import.meta.url).href,
    art: samsun,
    pos: '50% 60%',
  },
  {
    title: 'Ankara',
    src: new URL('../../assets/music/ankara.mp3', import.meta.url).href,
    art: warroom,
    pos: '50% 55%',
  },
  {
    title: 'Mehmets',
    src: new URL('../../assets/music/mehmets.mp3', import.meta.url).href,
    art: soldier,
    pos: '42% 22%',
  },
  { title: 'İnönü', src: new URL('../../assets/music/inonu.mp3', import.meta.url).href, art: supply, pos: '60% 45%' },
  {
    title: 'Sakarya',
    src: new URL('../../assets/music/sakarya.mp3', import.meta.url).href,
    art: trench,
    pos: '45% 65%',
  },
  { title: 'Taarruz', src: new URL('../../assets/music/taaruz.mp3', import.meta.url).href, art: ridge, pos: '50% 40%' },
  {
    title: 'For Those Who Never Returned',
    src: new URL('../../assets/music/for-those-who-never-returned.mp3', import.meta.url).href,
    art: deck,
    pos: '60% 55%',
  },
  {
    title: 'The Road to İzmir',
    src: new URL('../../assets/music/the-road-to-izmir.mp3', import.meta.url).href,
    art: westmap,
    pos: '38% 45%',
  },
  {
    title: 'Lausanne',
    src: new URL('../../assets/music/lausanne.mp3', import.meta.url).href,
    art: hall,
    pos: '70% 55%',
  },
  {
    title: 'The Dawn of Victory',
    src: new URL('../../assets/music/the-dawn-of-victory.mp3', import.meta.url).href,
    art: voyage,
    pos: '80% 20%',
  },
  {
    title: 'A Nation Unchained',
    src: new URL('../../assets/music/a-nation-unchained.mp3', import.meta.url).href,
    art: dawn,
    pos: '50% 40%',
  },
]
