/* `use:reveal`: the element rises into place the first time it scrolls into view (site.css draws the motion) */
export function reveal(node: HTMLElement) {
  node.classList.add('s-rv');
  const io = new IntersectionObserver(
    entries => {
      if (!entries.some(e => e.isIntersecting)) return;
      node.classList.add('s-on');
      io.disconnect();
    },
    { rootMargin: '0px 0px -12% 0px' }
  );
  io.observe(node);
  return { destroy: () => io.disconnect() };
}
