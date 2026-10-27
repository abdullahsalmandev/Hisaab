import { formatDate, paisaToInput, parseDateInput, toDateInput } from './helpers';

test('formatDate', () => {
  expect(formatDate(new Date(2026, 9, 25, 12).toISOString())).toBe('25 Oct 2026');
  expect(formatDate(new Date(2026, 0, 1, 12).toISOString())).toBe('1 Jan 2026');
});

test('toDateInput', () => {
  expect(toDateInput(new Date(2026, 9, 5, 23, 59))).toBe('2026-10-05');
});

test('parseDateInput', () => {
  const iso = parseDateInput('2026-10-25', new Date(2026, 0, 1, 9, 30, 15));
  expect(toDateInput(new Date(iso!))).toBe('2026-10-25');
  expect(new Date(iso!).getHours()).toBe(9);
  for (const bad of ['', '25-10-2026', '2026-13-01', '2026-02-30', '2026-1-5', 'abc']) expect(parseDateInput(bad)).toBeNull();
});

test('paisaToInput', () => {
  expect(paisaToInput(4500000)).toBe('45000');
  expect(paisaToInput(4500050)).toBe('45000.50');
  expect(paisaToInput(5)).toBe('0.05');
  expect(paisaToInput(120)).toBe('1.20');
});
