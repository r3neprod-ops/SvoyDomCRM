import Header from '@/components/layout/Header';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Container from '@/components/ui/Container';
import SectionHeader from '@/components/ui/SectionHeader';
import brand from '@/data/brand';
import complexes from '@/data/complexes';
import faq from '@/data/faq';
import processSteps from '@/data/process';
import reviews from '@/data/reviews';
import services from '@/data/services';

const MAX_URL = 'https://max.ru/u/f9LHodD0cOIi4r-SL0pK2dhDjayjfz3potOe5T20iWeHHeSSewgkP465gHM';

const RevealOnScroll = dynamic(() => import('@/components/RevealOnScroll'), { ssr: false });
const LeadFormSection = dynamic(() => import('@/components/sections/LeadFormSection'));
const ComplexCarouselCard = dynamic(() => import('@/components/complexes/ComplexCarouselCard'));

export default function HomePage() {
  return (
    <main>
      <RevealOnScroll />
      <Header />

      <div className="relative">
        <Image
          src="https://cdn.builder.io/api/v1/image/assets%2F5940eccd50a845709f0c0fa0a222cdc1%2F6e6b28460afc4aa4a8fb711213fa8d32?width=1600&quality=68&format=webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <section id="hero" className="relative pt-28 pb-16 md:pt-36 md:pb-24">
          <Container className="relative flex flex-col gap-5">
            {/* Hero Text Panel - localized backdrop only under content */}
            <div
              className="reveal max-w-xl sm:max-w-2xl md:max-w-3xl rounded-[18px] md:rounded-[22px] p-4 sm:p-5 md:p-6 border border-[rgba(17,24,39,0.10)]"
              style={{
                background: 'rgba(255, 255, 255, 0.55)',
                backdropFilter: 'blur(10px) saturate(120%)',
                WebkitBackdropFilter: 'blur(10px) saturate(120%)',
                boxShadow: '0 18px 50px rgba(17,24,39,0.10)',
              }}
            >
              {/* Urgency badge */}
              <div className="badge-urgent mb-4">
                <span className="badge-urgent-dot" />
                Актуально — май 2026 · Цены на новостройки растут
              </div>

              {/* H1 — контекст, 44px desktop / 28px mobile */}
              <h1 className="text-[1.75rem] font-bold leading-[1.08] tracking-tight text-[#111827] md:text-[2.75rem]">
                Квартиры в новостройках<br />Луганска от 5,2 млн ₽
              </h1>

              {/* Главный триггер — крупнее заголовка, самый заметный */}
              <div className="hero-rate-badge mt-5">
                Ипотека под 2% · за 24 часа
              </div>

              {/* Подзаголовок */}
              <p className="mt-4 max-w-2xl text-[16px] leading-[1.65] text-[rgba(17,24,39,0.72)]">
                Подберём квартиру бесплатно и проведём от выбора до ключей.
              </p>

              {/* Буллеты с иконками */}
              <ul className="mt-4 space-y-2.5">
                <li className="flex items-center gap-3 text-sm text-[rgba(17,24,39,0.72)]">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--accent2)] text-[10px] text-white font-bold">1</span>
                  Подбор квартиры за 1 день — бесплатно
                </li>
                <li className="flex items-center gap-3 text-sm text-[rgba(17,24,39,0.72)]">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--accent2)] text-[10px] text-white font-bold">2</span>
                  Работаем с военными и материнскими сертификатами
                </li>
                <li className="flex items-center gap-3 text-sm text-[rgba(17,24,39,0.72)]">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--accent2)] text-[10px] text-white font-bold">3</span>
                  Без первоначального взноса — варианты есть
                </li>
                <li className="flex items-center gap-3 text-sm text-[rgba(17,24,39,0.72)]">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--accent2)] text-[10px] text-white font-bold">4</span>
                  Высокий шанс одобрения ипотеки
                </li>
              </ul>

              {/* CTA */}
              <div className="mt-8">
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <Button as="a" href="#lead-form" className="px-7 py-4 text-[15px]">
                    Получить подборку квартир
                  </Button>
                  <Button
                    as="a"
                    href={brand.telegramUrl}
                    target="_blank"
                    rel="noreferrer"
                    variant="ghost"
                    className="border-[rgba(17,24,39,0.14)] bg-[rgba(255,255,255,0.35)] text-[#111827] [backdrop-filter:blur(12px)_saturate(140%)] hover:bg-[rgba(255,255,255,0.48)] hover:shadow-[0_10px_30px_rgba(17,24,39,0.10)] active:bg-[rgba(255,255,255,0.55)]"
                  >
                    Написать в Telegram
                  </Button>
                </div>
                <p className="cta-hint">Ответим в течение 5 минут</p>
              </div>

              {/* Контактные ссылки */}
              <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[rgba(17,24,39,0.72)]">
                <a className="focus-ring rounded-lg px-1" href={`tel:${brand.phoneHref}`}>{brand.phoneDisplay}</a>
                <a className="focus-ring rounded-lg px-1" href={brand.telegramUrl} target="_blank" rel="noreferrer">Telegram</a>
                <a className="focus-ring rounded-lg px-1" href={MAX_URL} target="_blank" rel="noopener noreferrer">MAX</a>
              </div>
            </div>

          </Container>
        </section>

        <LeadFormSection />
      </div>

      {/* ── Почему сейчас — urgency section ── */}
      <section className="py-16 md:py-20" style={{ background: 'linear-gradient(135deg, rgba(234,88,12,0.04) 0%, rgba(245,158,11,0.04) 100%)' }}>
        <Container>
          <SectionHeader title="Почему важно не откладывать" subtitle="Рынок новостроек Луганска меняется быстро — каждая неделя ожидания стоит денег." />
          <div className="grid gap-4 md:grid-cols-3">
            <div className="why-now-card reveal">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8B6914" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
              <h3 className="why-now-card__title">Цены растут каждый месяц</h3>
              <p className="why-now-card__text">Средний рост стоимости новостроек — 3–5% в месяц. Квартира за 4 млн сейчас через 3 месяца стоит 4,5 млн.</p>
            </div>
            <div className="why-now-card reveal">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8B6914" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              <h3 className="why-now-card__title">Квартир остаётся всё меньше</h3>
              <p className="why-now-card__text">Лучшие планировки разбирают первыми. Студии и однушки заканчиваются быстрее всего.</p>
            </div>
            <div className="why-now-card reveal">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8B6914" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <h3 className="why-now-card__title">Льготная ипотека ограничена</h3>
              <p className="why-now-card__text">Ипотека под 2% — государственная программа с лимитом мест. Условия могут измениться.</p>
            </div>
          </div>
          <div className="mt-8 text-center">
            <Button as="a" href="#lead-form" className="px-8 py-4 text-[15px]">Получить подборку сейчас</Button>
            <p className="cta-hint mt-2">Ответим в течение 5 минут</p>
          </div>
        </Container>
      </section>

      <section id="services" className="bg-[color:var(--bg2)] py-20 md:py-28">
        <Container>
          <SectionHeader title="Что входит в работу" subtitle="Подберём, одобрим, оформим — всё бесплатно для вас." />
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {services.map((item) => (
              <Card key={item.title} className="reveal">
                <h3 className="text-xl tracking-tight leading-[1.15]">{item.title}</h3>
                <p className="mt-3 text-[color:var(--muted)]">{item.description}</p>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      <section id="complexes" className="py-20 md:py-28">
        <Container>
          <SectionHeader title="Жилые комплексы" subtitle="Сравните ключевые варианты и выберите формат, который подходит под ваш сценарий покупки." />
          <div className="space-y-4">
            {/* Top row: 2 cards side by side */}
            <div
              className="relative rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-4"
              style={{
                backgroundImage: 'url()',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
              }}
            >
              {complexes.slice(0, 2).map((item) => (
                <ComplexCarouselCard key={item.id} complex={item} />
              ))}
            </div>
            {/* Bottom row: single card centered */}
            <div className="flex justify-center">
              <div className="w-full sm:w-[calc(50%-8px)]">
                {complexes.slice(2).map((item) => (
                  <ComplexCarouselCard key={item.id} complex={item} />
                ))}
              </div>
            </div>
          </div>
        </Container>
      </section>

      <section id="process" className="bg-[color:var(--bg2)] py-20 md:py-28">
        <Container>
          <SectionHeader title="Пошаговое сопровождение до подписания договора" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {processSteps.map((item, idx) => (
              <Card key={item.title} className="reveal">
                <p className="text-sm text-[color:var(--accent)]">0{idx + 1}</p>
                <h3 className="mt-2 text-xl tracking-tight">{item.title}</h3>
                <p className="mt-2 text-[color:var(--muted)]">{item.description}</p>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      <section id="reviews" className="py-20 md:py-28">
        <Container>
          <SectionHeader title="Что говорят клиенты" />
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {reviews.map((review) => (
              <Card key={review.name + review.sourceLabel} className="reveal">
                <p className="text-base">“{review.text}”</p>
                <p className="mt-5 text-xs uppercase tracking-[0.2em] text-[color:var(--accent)]">{review.sourceLabel}</p>
                <p className="mt-2 text-sm text-[color:var(--muted)]">{review.name}</p>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      <section id="trust" className="bg-[color:var(--bg2)] py-20 md:py-28">
        <Container>
          <SectionHeader title="Почему нам доверяют" />
          <div className="grid gap-5 md:grid-cols-3">
            <Card className="reveal text-center">
              <p className="text-4xl font-bold tracking-tight text-[color:var(--accent2)]">100+</p>
              <p className="mt-2 font-medium">клиентов</p>
              <p className="mt-1 text-sm text-[color:var(--muted)]">Более 100 семей уже купили квартиры с нашей помощью в Луганске</p>
            </Card>
            <Card className="reveal text-center">
              <p className="text-4xl font-bold tracking-tight text-[color:var(--accent2)]">98%</p>
              <p className="mt-2 font-medium">одобрений ипотеки</p>
              <p className="mt-1 text-sm text-[color:var(--muted)]">Высокий процент одобрения за счёт опыта работы с банками региона</p>
            </Card>
            <Card className="reveal text-center">
              <p className="text-4xl font-bold tracking-tight text-[color:var(--accent2)]">ИП</p>
              <p className="mt-2 font-medium">работаем официально</p>
              <p className="mt-1 text-sm text-[color:var(--muted)]">Зарегистрированный ИП, договор на каждую сделку, все прозрачно</p>
            </Card>
          </div>
        </Container>
      </section>

      <section id="faq" className="py-20 md:py-28">
        <Container>
          <SectionHeader title="Частые вопросы" />
          <div className="mb-6 rounded-2xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.68)] p-5">
            <h3 className="text-xl tracking-tight">Почему для вас бесплатно?</h3>
            <p className="mt-2 text-[color:var(--muted)]">Я сотрудничаю с застройщиками по Луганску. Когда вы выходите на сделку, застройщик оплачивает мою работу как партнёру. Для вас цена квартиры не меняется — вы получаете консультацию и сопровождение бесплатно.</p>
          </div>
          <div className="space-y-4">
            {faq.map((item) => (
              <Card key={item.q} className="reveal">
                <h3 className="text-xl tracking-tight">{item.q}</h3>
                <p className="mt-2 text-[color:var(--muted)]">{item.a}</p>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      <section id="contacts" className="py-20 md:py-28">
        <Container>
          <SectionHeader title="Оставьте заявку или напишите в Telegram" subtitle="Свяжусь с вами, уточню детали и покажу варианты, которые реально подходят." />
          <Card className="reveal">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <a href={`tel:${brand.phoneHref}`} className="focus-ring block rounded-lg text-2xl tracking-tight">{brand.phoneDisplay}</a>
                <a href={brand.telegramUrl} target="_blank" rel="noreferrer" className="focus-ring mt-2 inline-block rounded-lg text-[color:var(--accent2)]">Написать в Telegram</a>
                <a href={`mailto:${brand.email}`} className="focus-ring mt-1 block rounded-lg text-sm text-[color:var(--muted)] hover:text-[color:var(--accent2)]">{brand.email}</a>
              </div>
              <div className="text-sm text-[color:var(--muted)]">
                <p>{brand.ipLabel}</p>
                <p className="mt-1">{brand.ipInn}</p>
              </div>
            </div>
          </Card>
        </Container>
      </section>

      {/* Sticky CTA — mobile only */}
      <div className="fixed bottom-0 left-0 right-0 z-50 flex gap-2 border-t border-[color:var(--border)] bg-[rgba(247,242,234,0.95)] px-3 py-3 backdrop-blur-sm md:hidden">
        <a
          href={brand.telegramUrl}
          target="_blank"
          rel="noreferrer"
          className="flex flex-1 items-center justify-center rounded-xl border border-[color:var(--borderStrong)] bg-white py-3 text-sm font-medium text-[#111827] transition active:bg-[color:var(--bg2)]"
        >
          Написать в Telegram
        </a>
        <a
          href="#lead-form"
          className="flex flex-1 items-center justify-center rounded-xl py-3 text-sm font-medium text-white transition"
          style={{ background: 'var(--accent2)' }}
        >
          Получить подборку
        </a>
      </div>

      <footer className="border-t border-[color:var(--border)] pb-24 pt-8 md:py-8">
        <Container>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[color:var(--muted)]">
            <p>© {new Date().getFullYear()} svoydom-lugansk.ru</p>
            <Link href="/privacy-policy" className="focus-ring rounded-lg underline underline-offset-2 hover:text-[color:var(--accent2)]">
              Политика обработки персональных данных
            </Link>
          </div>
        </Container>
      </footer>
    </main>
  );
}
