// Hollin's own page behaviour: the savings calculator. Ada reads its numbers too
// (host.js puts them in her private context), so she can talk about your estimate.

const MODELS = [
  { name: 'Air 6', upTo: 120, price: 6900 },
  { name: 'Air 9', upTo: 200, price: 8400 },
  { name: 'Air 12', upTo: 280, price: 9900 },
];
// Share of today's heating bill a Hollin Air typically saves, by what it replaces.
const SAVING = { oil: 0.62, electric: 0.66, gas: 0.45, district: 0.35 };
const euros = (n) => `€${Math.round(n).toLocaleString('en-US')}`;

const form = document.getElementById('calc');
if (form) {
  const $ = (id) => document.getElementById(id);
  const update = () => {
    const fuel = form.elements.fuel.value;
    const bill = +$('calc-bill').value;
    const size = +$('calc-size').value;
    const model = MODELS.find((m) => size <= m.upTo) ?? MODELS.at(-1);
    const save = bill * SAVING[fuel];
    $('calc-bill-out').textContent = euros(bill);
    $('calc-size-out').textContent = `${size} m²`;
    $('calc-save').textContent = euros(Math.round(save / 50) * 50);
    $('calc-payback').textContent = (model.price / save).toFixed(1);
    $('calc-model').textContent = model.name;
    $('calc-model-note').textContent = `to ${model.upTo} m²`;
    window.hollinEstimate = {
      fuel: form.querySelector('input[name="fuel"]:checked').nextElementSibling.textContent,
      bill: euros(bill), size: `${size} m²`, save: euros(Math.round(save / 50) * 50),
      payback: `${(model.price / save).toFixed(1)} years`, model: model.name,
    };
  };
  form.addEventListener('input', update);
  form.addEventListener('submit', (e) => e.preventDefault());
  update();
}
