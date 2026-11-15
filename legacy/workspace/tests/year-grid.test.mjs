import test from 'node:test';
import assert from 'node:assert/strict';
import {gridDestination,monthDays,inAcademicYear} from '../lib/year-grid.js';

test('academic year is March through next February, including leap dates',()=>{
  assert(inAcademicYear(2027,'2027-03-01'));
  assert(inAcademicYear(2027,'2028-02-29'));
  assert(!inAcademicYear(2027,'2028-03-01'));
  assert.equal(monthDays(2028,2),29);
  assert.equal(monthDays(2027,2),28);
});
test('vertical arrows move the day within a month and clamp at end',()=>{
  assert.equal(gridDestination(2027,'2027-03-10','ArrowUp'),'2027-03-09');
  assert.equal(gridDestination(2027,'2027-03-10','ArrowDown'),'2027-03-11');
  assert.equal(gridDestination(2027,'2027-04-30','ArrowDown'),'2027-04-30');
});
test('horizontal arrows switch month and clamp nonexistent dates',()=>{
  assert.equal(gridDestination(2027,'2027-03-31','ArrowRight'),'2027-04-30');
  assert.equal(gridDestination(2027,'2027-12-31','ArrowRight'),'2028-01-31');
  assert.equal(gridDestination(2027,'2028-01-31','ArrowRight'),'2028-02-29');
  assert.equal(gridDestination(2027,'2027-03-01','ArrowLeft'),null);
});
test('Home End and Page keys respect academic year bounds',()=>{
  assert.equal(gridDestination(2027,'2027-06-15','Home'),'2027-06-01');
  assert.equal(gridDestination(2027,'2027-06-15','End'),'2027-06-30');
  assert.equal(gridDestination(2027,'2028-02-15','PageDown'),null);
});
