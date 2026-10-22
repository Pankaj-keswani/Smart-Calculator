import { groupDigits } from '../src/utils/numberFormat';

describe('groupDigits (display only)', () => {
  test.each([
    ['150000', 'western', '150,000'],
    ['150000', 'indian', '1,50,000'],
    ['12345678.125', 'indian', '1,23,45,678.125'],
    ['123456789×987654321', 'western', '123,456,789×987,654,321'],
    ['999', 'western', '999'],
    ['1.219326311e17', 'western', '1.219326311e17'],
    ['0.000012345', 'western', '0.000012345'],
    ['-25000', 'indian', '-25,000'],
    ['₹8350 INR', 'indian', '₹8,350 INR'],
    ['31.0685596119 miles', 'western', '31.0685596119 miles'],
  ])('%s (%s) -> %s', (input, style, expected) => {
    expect(groupDigits(input, style as 'indian' | 'western')).toBe(expected);
  });
});
