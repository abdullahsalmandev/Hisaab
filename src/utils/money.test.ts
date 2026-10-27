import { formatMoney, toPaisa } from './money';

test('toPaisa', () => {
  expect(toPaisa('45,000.50')).toBe(4500050);
  expect(toPaisa('100')).toBe(10000);
  expect(toPaisa('.5')).toBe(50);
  expect(toPaisa('0.07')).toBe(7);
  expect(toPaisa('19.99')).toBe(1999);
  for (const bad of ['', '  ', 'abc', '0', '0.00', '-5', '1.234', '1.2.3']) expect(toPaisa(bad)).toBeNull();
});

test('formatMoney', () => {
  expect(formatMoney(0)).toBe('Rs 0');
  expect(formatMoney(99900)).toBe('Rs 999');
  expect(formatMoney(4500000)).toBe('Rs 45,000');
  expect(formatMoney(4500050)).toBe('Rs 45,000.50');
  expect(formatMoney(123456700)).toBe('Rs 12,34,567');
  expect(formatMoney(5)).toBe('Rs 0.05');
  expect(formatMoney(-300000)).toBe('-Rs 3,000');
});
