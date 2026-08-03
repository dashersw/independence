import type { LandingCopy } from './en'

export const tr: LandingCopy = {
  document: {
    title: 'Kurtuluş · Türk Kurtuluş Savaşı üzerine bir strateji oyunu',
    description:
      'Gerçek olaylar, gerçek sınırlar ve kendi kendine öğrenen yedi taraf. 19 Mayıs 1919’da Samsun’a çıkıyorsunuz; bundan sonrası size kalmış.',
  },
  hero: {
    dateline: '19 Mayıs 1919 · Samsun',
    title: 'Kurtuluş',
    tagline: 'İşgal edilen bir vatan. Kazanılacak bir istiklal.',
    cta: 'Oyuna git',
    meta: 'Türk Kurtuluş Savaşı üzerine bir strateji oyunu',
    alt: 'Şafak sökerken karanlık denizde ilerleyen Bandırma Vapuru',
  },
  stops: [
    { id: 'top', label: 'Yolculuk' },
    { id: 'story', label: 'Durum' },
    { id: 'moments', label: 'Savaş' },
    { id: 'board', label: 'Harita' },
    { id: 'history', label: 'Kurallar' },
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
    title: ['Sizden istenen asayişi sağlamak,', 'ancak siz mücadeleyi başlatmaya gidiyorsunuz.'],
    copy: '21 Nisan 1919 tarihli İngiliz notası, Karadeniz’deki karışıklığı gerekçe göstererek işgal tehdidinde bulunur. Hükümetin cevabı, bölgeye geniş yetkili bir müfettiş göndermek olur: 30 Nisan’da 9. Ordu Müfettişliği’ne tayininiz padişah tarafından onaylanır. 6 Mayıs tarihli talimat vazifenizi sıralar: asayişi sağlamak, silahları toplamak, millî teşkilatları dağıtmak. Ancak aynı talimat, bölgedeki bütün askerî birliklere ve mülkî amirlere emir verme yetkisini de size tanır.',
  },
  deck: {
    label: 'Bandırma’nın güvertesinden gördükleriniz',
    alt: 'Alacakaranlıkta ağır denizde ilerleyen eski bir vapurun yağmurdan ıslanmış güvertesi',
    dateline: '16-19 Mayıs 1919 · Karadeniz',
    heading: 'Karşı kıyıda ne düzenli ordu var ne de asayiş.',
    copy: 'Bu yetkiyle 16 Mayıs Cuma öğleden sonra Galata rıhtımında Bandırma’ya biniyorsunuz; üç gün sonra Samsun’a çıkacaksınız. Sizi bekleyen bölgede birlikler mütareke gereği dağıtılmış, silahlar teslim ediliyor, asayiş çetelerin elinde. Devletin otoritesi kâğıt üzerinde kalmış; yerinde ise Müdafaa-i Hukuk cemiyetleri kendi başına örgütleniyor.',
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
  rules: {
    kicker: 'Kurallar',
    title: ['Kuralların hepsi tarihten çıkıyor.'],
    copy: 'Buradaki hikâye, oyunun üzerine sonradan giydirilmiş bir kılıf değil. Her kural, “gerçekte ne oldu” sorusuna verilmiş bir cevap. Tarih Ankara’ya neyi dayattıysa, oyun da size onu dayatıyor.',
  },
  cards: {
    kicker: 'Oyundan görüntü · Olay destesi',
    title: ['Dönüm noktaları masaya kart olarak geliyor.'],
    copy: '1919 kongrelerinden yirmili yılların ortasındaki antlaşmalara kadar yirmi sekiz tarihli olay. Her biri kendi tarihine denk gelen turda çıkıyor ve her biri elle tutulur bir şey değiştiriyor. Birkaçı ise kararı size bırakıyor.',
  },
  factions: {
    kicker: 'Karşı taraf',
    title: ['Yapay zekâya karşı oynuyorsunuz.'],
    copy: 'Her tarafı kendi sinir ağı oynuyor. Kurallarını kimse elle yazmadı; hepsi kendi kendine oynayarak öğrendi. İngiltere’ye Boğazlar’ı tut, İtalya’ya yerinde kal denmedi. Her biri yalnızca kendi hedefinden puan alıyor; o puanın peşinde nereye gideceği kendi kararı.',
    items: [
      {
        key: 'Turkey',
        name: 'Türkiye',
        aim: 'Puanını Misak-ı Millî’den alır: Edirne’den Kars’a otuz il. Bunun dışında kalan hiçbir yerden puan almaz.',
      },
      {
        key: 'Greece',
        name: 'Yunanistan',
        aim: 'İzmir ve Ege kıyısı elinde. Deniz aşırı ikmalin elverdiği ölçüde iç bölgelere ilerliyor.',
      },
      {
        key: 'Britain',
        name: 'İngiltere',
        aim: 'Boğazlar ve İstanbul onun elinde. Harp bitti, ordu terhis edildi; Anadolu’ya yeni tümen gelmiyor.',
      },
      {
        key: 'France',
        name: 'Fransa',
        aim: 'Çukurova’yı düşük maliyetle elde tutmak istiyor, her zayiatı hesaplıyor ve sessizce çıkış arıyor.',
      },
      {
        key: 'Italy',
        name: 'İtalya',
        aim: 'Güneybatıdaki imtiyaz bölgesinde bekliyor. Tarihte kimseyle çarpışmadı; ödül fonksiyonu da aynı sonuca varıyor.',
      },
      {
        key: 'Armenia',
        name: 'Ermenistan',
        aim: 'Doğu illerinde hak iddia ediyor. Kars ve Iğdır, 1919’daki gibi onun idaresinde başlıyor.',
      },
      {
        key: 'Bulgaria',
        name: 'Bulgaristan',
        aim: 'Anlaşmazlığı Ankara’yla değil, Yunanistan’la. Neuilly silah sınırı üç takviyeden fazlasına izin vermiyor.',
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
    brand: 'Kurtuluş',
    years: '1919 · 1923',
    tagline: 'Türk Kurtuluş Savaşı üzerine tarihî bir strateji oyunu.',
    links: [
      { href: '#story', label: 'Hikâye' },
      { href: '#board', label: 'Harita' },
      { href: '#history', label: 'Kurallar' },
      { href: '#cards', label: 'Kartlar' },
      { href: '#factions', label: 'Taraflar' },
      { href: '#soundtrack', label: 'Müzik' },
    ],
  },
  nav: { label: 'Sayfa bölümleri' },
}
