import type { LandingCopy } from './en'

export const tr: LandingCopy = {
  document: {
    title: 'Kurtuluş · Kurtuluş Savaşı üzerine bir strateji oyunu',
    description:
      'Gerçek olaylar, gerçek sınırlar ve karşınızda yedi taraf. 19 Mayıs 1919’da Samsun’a çıkıyorsunuz; bundan sonrası size kalmış.',
  },
  hero: {
    dateline: '19 Mayıs 1919 · Samsun',
    title: 'Kurtuluş',
    tagline: 'İşgal edilen bir vatan. Kazanılacak bir istiklal.',
    cta: 'Oyuna git',
    meta: 'Kurtuluş Savaşı üzerine bir strateji oyunu',
    alt: 'Şafak sökerken karanlık denizde ilerleyen Bandırma Vapuru',
  },
  stops: [
    { id: 'top', label: 'Yolculuk' },
    { id: 'story', label: 'Durum' },
    { id: 'moments', label: 'Savaş' },
    { id: 'board', label: 'Harita' },
    { id: 'cards', label: 'Kartlar' },
    { id: 'factions', label: 'Karşı taraf' },
    { id: 'soundtrack', label: 'Müzik' },
  ],
  story: {
    kicker: 'Birinci Bölüm · Durum',
    title: ['Yurdun dört bir yanı işgal altında.', 'Ordular terhis edilmiş.'],
    copy: 'Harp sona erdi, hesaplaşma başladı. İtilaf donanması Boğaz’da, İngiliz garnizonu İstanbul’da, Yunan ordusu İzmir’e çıkmak üzere. Anadolu’nun haritası Paris’te ve Londra’da çiziliyor; masada bu toprakların sahibi yok. Oyun tam o haritanın üzerinde, 1919 Mayıs’ında başlıyor. Haritadaki en zor mevzi sizin. Bundan sonrası size kalmış, Paşam.',
  },
  bosphorus: {
    label: 'İşgal altındaki Boğaziçi, Kasım 1918',
    alt: 'İstanbul silüetinin önünde demirlemiş İtilaf zırhlıları',
    dateline: 'Kasım 1918 · Boğaziçi',
    heading: 'Düşman donanması Dolmabahçe’nin önüne demirledi.',
    copy: 'Cihan Harbi’ni kazanan donanma Boğaz’a girdi. Mondros Mütarekesi imzalandı, ordu terhis edildi, silahlar teslim ediliyor. Kâğıt üzerinde her şey sona ermiş durumda.',
  },
  duty: {
    kicker: 'İkinci Bölüm · Vazife',
    title: ['Durup ihtimalleri', 'tartmayacaksınız.'],
    copy: 'Bir Osmanlı paşasısınız; müfettişlik talimatıyla Samsun’a gönderildiniz: silahsızlanmayı denetleyin, asayişi koruyun. Sizin başka fikirleriniz var. 16 Mayıs 1919’da küçük SS Bandırma vapuru donanmanın gözleri önünde İstanbul’dan ayrılır; içerilere uzanan yol başlar.',
  },
  deck: {
    label: 'Bandırma’nın güvertesinden bakışınız',
    alt: 'Bulunduğunuz yerden, alacakaranlıkta kabaran denizde ilerleyen eski bir vapurun yağmurdan ıslanmış güvertesi',
    dateline: '17 Mayıs 1919 · SS Bandırma’da',
    heading: 'İleride Samsun ve henüz kimsenin ilan etmediği bir savaş var.',
    copy: 'Refakatsiz, açık denizde üç gün. Öte uçta henüz bir araya gelmemiş direniş kuvvetleri ve kendisine henüz ne istediği sorulmamış bir halk bekliyor. Karaya çıktığınızda emrinizde bir ordu değil, yalnızca bir ihtimal olacak.',
  },
  route: {
    label: 'İstanbul’dan Meclis’in açılışına giden yol',
    stops: [
      { date: '16 Mayıs 1919', place: 'İstanbul', note: 'Yola çıkış' },
      { date: '19 Mayıs 1919', place: 'Samsun', note: 'Karaya çıkış' },
      { date: '22 Haziran 1919', place: 'Amasya', note: 'Genelge' },
      { date: '23 Temmuz 1919', place: 'Erzurum', note: 'Doğu kongresi' },
      { date: '4 Eylül 1919', place: 'Sivas', note: 'Millî kongre' },
      { date: '23 Nisan 1920', place: 'Ankara', note: 'Meclis açılıyor' },
    ],
  },
  moments: {
    kicker: 'Üçüncü Bölüm · Savaş',
    title: ['Millet yorgun ve fakir.', 'Yine de savaşacak.'],
    copy: 'Elinde kalan ne varsa size veriyor. Kongre, toplanacağı bir şehir ister; ordu, halktan gelecek ikmali. Savunma hattı zaman ister, taarruz ise ayakta kalacak bir kuvvet. Hepsinin bedelini aynı millet ödüyor.',
  },
  hands: {
    label: 'Kumandanın gözünden: harita, küpeşte, pusula ve dürbün',
    alt: 'Üç görüntü: harita üzerinde eldivenli bir el, denizin üstünde küpeşteyi kavrayan eller, açık duran bir pusula ve dürbün',
  },
  board: {
    kicker: 'Harita · Mayıs 1919',
    title: ['Millî Mücadele’nin başladığı yerden başlıyorsunuz.'],
    copy: 'On altı il, çoğu iç Anadolu’da. Haritada, her birinin kendi hesabı olan altı taraf daha var: İzmir’de Yunanistan, Boğazlar’da İngiltere, Çukurova’da Fransa, güneybatıda İtalya, doğuda Ermenistan, Trakya’nın öte yanında Bulgaristan. Hedefiniz haritanın tamamı değil: son Osmanlı Meclisi’nin oyladığı otuz il, yani Misak-ı Millî.',
    chip: '⚑ Oyundan görüntü',
    caption: 'Mayıs 1919 · 1. Tur, tarihî başlangıç mevzii',
    alt: 'Kurtuluş oyununun haritası, Mayıs 1919 tarihî başlangıç mevziinde',
    objectiveLabel: 'Misak-ı Millî',
    objectiveValue: '16 / 30',
    objectiveBar: 'Otuz Misak-ı Millî ilinden on altısı elde',
    objectiveCopy:
      'Başlangıçta elinizde bulunan Misak-ı Millî illeri. Zafer, otuzunu da elde tutmak ve orada durmaktır.',
  },
  cards: {
    kicker: 'Oyundan görüntü · Olay destesi',
    title: ['Dönüm noktaları masaya kart olarak geliyor.'],
    copy: '1919 kongrelerinden yirmili yılların ortasındaki antlaşmalara kadar yirmi sekiz tarihli olay. Her biri kendi tarihine denk gelen turda çıkıyor ve her biri elle tutulur bir şey değiştiriyor. Birkaçı ise kararı size bırakıyor.',
    note: 'Yirmi sekizin dördü. Kalanıyla savaş sırasında karşılaşacaksınız; bazıları ancak savaşınız onları hak ederse gelir.',
    exhibits: [
      {
        alt: 'Oyun içi olay kartı: Erzurum Kongresi, Temmuz 1919',
        dateline: 'Temmuz 1919 · Doğu örgütleniyor',
        title: 'Erzurum Kongresi',
        copy: 'Erzurum elinizdeyse, doğudaki her il milis topluyor.',
      },
      {
        alt: 'Oyun içi olay kartı: Büyük Millet Meclisi Ankara’da açılıyor',
        dateline: 'Nisan 1920 · Hükümet kuruluyor',
        title: 'Meclis açılıyor',
        copy: 'Tek elden komuta, millî yetki. Hepsi elde tutulan bir makama bağlı.',
      },
      {
        alt: 'Oyun içi olay kartı: Sevr Antlaşması, Ağustos 1920',
        dateline: 'Ağustos 1920 · Dayatılan barış',
        title: 'Sevr',
        copy: 'İki tur askere yazılmayı çökertir, sonra sertleştirir: direniş silahlı bir millete dönüşür.',
      },
      {
        alt: 'Oyun içi olay kartı İngilizce: İnönü Muharebesi, Ocak 1921',
        dateline: 'Ocak 1921 · And in English',
        title: 'İnönü hattı tutuyor',
        copy: 'Her kart, her satır, her harita etiketi iki dilde. Oyunun ortasında değiştirebilirsiniz.',
      },
    ],
  },
  factions: {
    kicker: 'Karşı taraf',
    title: ['Her rakip, ülkesinin tarihî tutumuyla eğitilmiş bir yapay zekâ.'],
    items: [
      { key: 'Greece', name: 'Yunanistan', copy: 'Samsun’a varmanızdan dört gün önce ordusu İzmir’de karaya çıkar.' },
      {
        key: 'Britain',
        name: 'İngiltere',
        copy: 'İmparatorluk savaşı kazandı; şimdi barışın bekçiliğini yapmak zorunda.',
      },
      { key: 'France', name: 'Fransa', copy: 'Avrupa’daki zaferin ardından bu kez sancılı bir işgal başladı.' },
      {
        key: 'Italy',
        name: 'İtalya',
        copy: 'Roma’nın barıştan beklediği, uğruna savaşmayı göze aldığından fazlaydı.',
      },
      {
        key: 'Armenia',
        name: 'Ermenistan',
        copy: 'Daha bir yaşını bile doldurmamış bir cumhuriyet; sınırlarının hiçbiri henüz kesinleşmiş değil.',
      },
      {
        key: 'Bulgaria',
        name: 'Bulgaristan',
        copy: 'Yenilgi, ardında küçülmüş bir ülke ve antlaşmayla kısıtlanmış bir ordu bıraktı.',
      },
    ],
  },
  score: {
    kicker: 'Oyunun müziği',
    title: ['Savaşın tamamı, on üç parçada.'],
    copy: 'Müziğin tamamını sırayla dinleyebilir, tek bir bölüm seçebilir veya istediğiniz parçayı indirebilirsiniz.',
  },
  charge: {
    label: 'Gençliğe Hitabe’den',
    lines: ['Muhtaç olduğun kudret,', 'damarlarındaki asil kanda mevcuttur.'],
    sub: 'Mustafa Kemal Atatürk · Gençliğe Hitabe, 1927',
  },
  final: {
    label: 'Oyuna başla',
    alt: 'Harekât masasına serilmiş Anadolu haritası',
  },
  footer: {
    team: 'Takım',
    imprint: 'Künye',
    openSource: 'GitHub’da açık kaynak',
    brand: 'Kurtuluş',
    years: '1919 · 1923',
    tagline: 'Kurtuluş Savaşı üzerine tarihî bir strateji oyunu.',
    links: [
      { href: '#story', label: 'Hikâye' },
      { href: '#board', label: 'Harita' },
      { href: '#cards', label: 'Kartlar' },
      { href: '#factions', label: 'Taraflar' },
      { href: '#soundtrack', label: 'Müzik' },
    ],
  },
  nav: { label: 'Sayfa bölümleri' },
}
