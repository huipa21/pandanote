import { renderMermaidProbe, sanitizeSvgProbe } from '../spikes/mermaid';

const source = document.querySelector<HTMLTextAreaElement>('#source')!;
const output = document.querySelector<HTMLDivElement>('#output')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;

document.querySelector('#render')!.addEventListener('click', () => {
  status.textContent = 'Loading';
  void renderMermaidProbe(source.value)
    .then((svg) => {
      output.innerHTML = svg;
      status.textContent = 'Rendered';
    })
    .catch(() => {
      output.replaceChildren();
      status.textContent = 'Invalid diagram';
    });
});

document.querySelector('#sanitize')!.addEventListener('click', () => {
  output.innerHTML = sanitizeSvgProbe(source.value);
  status.textContent = 'Sanitized';
});
