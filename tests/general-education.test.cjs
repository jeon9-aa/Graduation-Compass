const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const data = JSON.parse(fs.readFileSync('general-education.json', 'utf8'));

test('PDF catalog has all six competencies and preserves course names and credits', () => {
  assert.equal(data.competencies.length, 6);
  assert.equal(data.courses.length, 341);
  assert.equal(new Set(data.courses.map(c => c.id)).size, 341);
  assert.equal(data.courses.filter(c => c.category === 'essential').length, 15);
  for (const category of ['essential', 'balance']) {
    for (const name of data.competencies) {
      assert.ok(data.courses.some(c => c.category === category && c.competencies.includes(name)));
    }
  }
  for (const c of data.courses) {
    assert.ok([1, 2, 3].includes(c.credits));
    assert.ok(data.competencies.includes(c.competencies[0]));
    assert.ok(c.name && !c.name.includes('\n'));
  }
  assert.equal(data.courses.find(c => c.name === '인간과재난,생존의과학').credits, 3);
  assert.equal(data.courses.find(c => c.name === '사랑,결혼그리고부모됨').credits, 2);
  assert.equal(data.courses.filter(c => c.choice && c.competencies.includes('글로벌감각')).length, 6);
});

test('nested groups, filters, completion and saved expansion work together', () => {
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, {
      value: ['#grade-filter', '#status-filter'].includes(selector) ? 'all' : '',
      innerHTML: '', addEventListener() {}, querySelectorAll() { return []; },
      querySelector() { return { focus() {} }; }, scrollIntoView() {}
    });
    return elements.get(selector);
  };
  const context = vm.createContext({
    document: { querySelector: element, addEventListener() {} },
    localStorage: { getItem() { return null; }, setItem() {} },
    console, data, window: { matchMedia() { return { matches: true }; } }
  });
  const script = fs.readFileSync('index.html', 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInContext(script.replace(/\binit\(\);\s*$/, ''), context);
  const run = code => vm.runInContext(code, context);
  run(`generalEducation = data; DATA.courses = data.courses; DATA.areas = []; DATA.competencies = data.competencies; DATA.total = 130; renderCourses(calculate(selected));`);
  assert.equal((element('#courses').innerHTML.match(/class="competency-group"/g) || []).length, 12);
  assert.match(element('#courses').innerHTML, /교양 필수/);
  assert.match(element('#courses').innerHTML, /교양 선택/);
  run(`selected.add(DATA.courses.find(c => c.name === '대학생활과진로설계').id); opened.add('essential-competency-0'); renderCourses(calculate(selected));`);
  assert.equal(run('calculate(selected).total'), 1);
  assert.equal(run('calculate(selected).byCategory.essential'), 1);
  assert.match(element('#courses').innerHTML, /data-group="essential-competency-0" open/);
  element('#status-filter').value = 'done';
  run('renderCourses(calculate(selected));');
  assert.equal((element('#courses').innerHTML.match(/class="course-row"/g) || []).length, 1);
  element('#status-filter').value = 'all';
  element('#search').value = '미적분학';
  run('renderCourses(calculate(selected));');
  assert.equal((element('#courses').innerHTML.match(/class="course-row"/g) || []).length, 3);
  element('#search').value = '없는 과목 검색';
  run('renderCourses(calculate(selected));');
  assert.equal(element('#no-results').hidden, false);
  assert.equal((element('#courses').innerHTML.match(/class="competency-group"/g) || []).length, 12);
  run('renderGeneralCompletion(calculate(selected).courses);');
  let table = element('#general-completion').innerHTML;
  assert.equal((table.match(/class="completion-link"/g) || []).length, 24);
  assert.equal((table.match(/is-complete/g) || []).length, 1);
  assert.match(table, /필수교양 필수 · 주도적사고: 이수 1과목/);
  run(`selected.add(DATA.courses.find(c => c.name === '서양고전의이해').id);
    selected.add(DATA.courses.find(c => c.name === '동양철학고전읽기').id);
    renderGeneralCompletion(calculate(selected).courses);`);
  table = element('#general-completion').innerHTML;
  assert.equal((table.match(/is-complete/g) || []).length, 2);
  assert.match(table, /균형교양 인간문화영역 · 주도적사고: 이수 2과목/);
  run(`renderGeneralCompletion([{category: 'elective', area: '인간문화', competencies: ['주도적사고']}]);`);
  assert.equal((element('#general-completion').innerHTML.match(/is-complete/g) || []).length, 0);
  run('selected.clear(); renderGeneralCompletion(calculate(selected).courses);');
  assert.equal((element('#general-completion').innerHTML.match(/is-complete/g) || []).length, 0);
  for (const category of ['essential', 'balance']) {
    for (const [index, competency] of data.competencies.entries()) {
      element('#search').value = '없는 과목';
      element('#grade-filter').value = '4';
      element('#status-filter').value = 'done';
      run(`goToGeneralCompetency('${category}', '${competency}');`);
      assert.equal(element('#search').value, '');
      assert.equal(element('#grade-filter').value, 'all');
      assert.equal(element('#status-filter').value, 'all');
      assert.match(element('#courses').innerHTML, new RegExp(`data-group="${category}-competency-${index}" open`));
      assert.equal(run('selected.size'), 0);
    }
  }
});
