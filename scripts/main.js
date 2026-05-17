// Reveal on scroll, sticky CTA hide near footer, year, 3D fallback.

const reveal = new IntersectionObserver((entries) => {
    for (const entry of entries) {
        if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            reveal.unobserve(entry.target);
        }
    }
}, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

for (const el of document.querySelectorAll('[data-reveal]')) {
    reveal.observe(el);
}

const sticky = document.querySelector('[data-sticky-cta]');
const foot = document.querySelector('.foot');
if (sticky && foot) {
    const footWatch = new IntersectionObserver((entries) => {
        const visible = entries.some((e) => e.isIntersecting);
        sticky.dataset.hidden = visible ? 'true' : 'false';
    }, { threshold: 0.05 });
    footWatch.observe(foot);
}

const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

// Hero photo crossfade slideshow.
(function heroSlideshow() {
    const stack = document.getElementById('hero-photo');
    if (!stack) return;
    const photos = stack.querySelectorAll('.visual__photo-img');
    if (photos.length < 2) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let i = 0;
    setInterval(() => {
        photos[i].classList.remove('is-active');
        i = (i + 1) % photos.length;
        photos[i].classList.add('is-active');
    }, 4200);
})();

// Showcase 3D is rendered via a standalone three.js module inside index.html
// so it can use a custom shader for the wireframe reveal effect.
