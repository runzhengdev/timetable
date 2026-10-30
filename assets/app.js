/* ============================================================
   我的教务系统 — 逻辑（逐周快照模型）
   ------------------------------------------------------------
   课表按「周」存快照：第 N 周有自己的一份课程列表，
   增删改只影响当周，绝不自动套用到其他周（课表是会变的）。
   数据来自 UI 目录第三 / 四 / 六 / 七周快照；第 5 周确认无课。
   只保留课程信息，不含姓名 / 学号 / 院系等身份字段。
   ============================================================ */
(function () {
  'use strict';

  /* ==================== 常量 ==================== */

  const DAYS = [1, 2, 3, 4, 5, 6, 7];
  const DAY_NAMES = {
    1: '星期一', 2: '星期二', 3: '星期三', 4: '星期四',
    5: '星期五', 6: '星期六', 7: '星期日'
  };
  const DAY_SHORT = { 1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六', 7: '周日' };

  /* 教务系统的节次分段（与原页面一致，不臆造单节分钟） */
  const BLOCKS = [
    { no: '第1-2节', periods: [1, 2], time: '08:30-09:50' },
    { no: '第3-4节', periods: [3, 4], time: '10:00-11:20' },
    { no: '第5节', periods: [5], time: '11:30-12:10' },
    { no: '第6-7节', periods: [6, 7], time: '14:00-15:20' },
    { no: '第8-9节', periods: [8, 9], time: '15:30-16:50' },
    { no: '第10-11节', periods: [10, 11], time: '18:30-19:50' },
    { no: '第12-13节', periods: [12, 13], time: '20:00-21:20' }
  ];

  const MAX_PERIOD = 13;
  const ATTRS = ['必修', '选修', '限选', '任选'];
  const PALETTE = [232, 205, 268, 340, 163, 24, 190, 300, 45, 118];

  /* 只有外观偏好留在本机；课表内容每次加载都以内置数据为准 */
  const KEY_SETTINGS = 'jwxt.settings.v2';

  /* 早期版本写入本机、现在已不再沿用的键（加载时清理） */
  const STALE_KEYS = [
    'jwxt.settings.v1', 'jwxt.schedule.v2', 'jwxt.schedule.v1', 'jwxt.terms.v1',
    'jwxt.wipedTerms.v1', 'jwxt.seedRev', 'jwxt.seedSynced', 'jwxt.prevSchedule',
    'jwxt.courses.v1'
  ];

  /* 任课教师（按课名映射，缺的留空显示“待补充”） */
  const TEACHERS = {
    '金融科技基础': '李小杭',
    '思想道德与法治': '黄亚丽',
    '大学英语Ⅰ': '许燕兰',
    '国家安全教育': '杜琰豪',
    '金融基础': '薛宇辰',
    '大学生职业生涯与规划': '梁广洋',
    '会计基础': '徐宏菲',
    '体育Ⅰ': '陈洪武',
    '习近平经济思想概论': '吴红宇',
    '形势与政策Ⅰ': '邱春明'
  };

  /* 三个年级 × 两个学期：预留给后续把别的年级/学期也纳进来 */
  const TERM_SEED = [
    {
      key: '2026S1', grade: 2026, index: 1, label: '2026 级 · 第 1 学期', termStart: '2026-08-31',
      // 军训：10-24（周六）~ 11-06（周五），横跨第 8 周末 + 第 9 周 + 第 10 周前半
      events: [{ type: 'military', label: '军训', from: '2026-10-24', to: '2026-11-06' }]
    },
    { key: '2026S2', grade: 2026, index: 2, label: '2026 级 · 第 2 学期', termStart: '2027-03-01' },
    { key: '2025S1', grade: 2025, index: 1, label: '2025 级 · 第 1 学期', termStart: '2025-09-01' },
    { key: '2025S2', grade: 2025, index: 2, label: '2025 级 · 第 2 学期', termStart: '2026-03-02' },
    { key: '2024S1', grade: 2024, index: 1, label: '2024 级 · 第 1 学期', termStart: '2024-09-02' },
    { key: '2024S2', grade: 2024, index: 2, label: '2024 级 · 第 2 学期', termStart: '2025-03-03' }
  ];
  const ACTIVE_TERM = '2026S1';   // 本学期（2026 级大一上）

  const DEFAULT_SETTINGS = { termStart: '2026-08-31', totalWeeks: 20, theme: 'dark', viewMode: 'auto' };

  /* 已确认无课的周（有记录、但节课为 0） */
  const WEEK_NOTES = {
    1: '开学周（2026-09-01 开学），无课',
    2: '这一周无课',
    5: '国庆假期，整周无课',
    9: '军训（10-24 ~ 11-06），整周无课',
    10: '军训（10-24 ~ 11-06），本周周一至周五无课',
    19: '学期末，校历标注无课',
    20: '学期末，校历标注无课'
  };

  /* 教务导出的理论课表（独立轨道）：整学期一览，与逐周实际课表分开 */
  const THEORY = {
    source: '教务「学生个人课表」导出 · 2026-2027 第 1 学期',
    units: [
    { name: "金融科技基础", teacher: "李小杭", room: "教B401", day: 1, periods: [1, 2], weeks: [4, 7, 8, 11, 12, 13, 14, 15, 16, 17] },
    { name: "思想道德与法治", teacher: "黄亚丽", room: "教B401", day: 1, periods: [3, 4], weeks: [4, 7, 8, 11, 12, 13, 14, 15, 16, 17, 18] },
    { name: "大学英语Ⅰ", teacher: "许燕兰", room: "教A204", day: 1, periods: [6, 7], weeks: [4, 7, 8] },
    { name: "大学英语Ⅰ", teacher: "许燕兰", room: "教B201", day: 1, periods: [6, 7], weeks: [14, 15, 16, 17, 18] },
    { name: "国家安全教育", teacher: "杜琰豪", room: "教B401", day: 1, periods: [10, 11, 12, 13], weeks: [11, 12, 13, 14] },
    { name: "思想道德与法治", teacher: "黄亚丽", room: "教B403", day: 1, periods: [10, 11], weeks: [17] },
    { name: "思想道德与法治", teacher: "黄亚丽", room: "教B401", day: 1, periods: [10, 11], weeks: [18] },
    { name: "大学英语Ⅰ", teacher: "许燕兰", room: "教B401", day: 2, periods: [1, 2], weeks: [4, 7, 8] },
    { name: "大学英语Ⅰ", teacher: "许燕兰", room: "教A204", day: 2, periods: [1, 2], weeks: [14] },
    { name: "金融基础", teacher: "薛宇辰", room: "教B302", day: 2, periods: [1, 2], weeks: [15, 16, 17] },
    { name: "思想道德与法治", teacher: "黄亚丽", room: "教B403", day: 2, periods: [3, 4], weeks: [6] },
    { name: "思想道德与法治", teacher: "黄亚丽", room: "教B403", day: 2, periods: [3, 4], weeks: [4, 7, 8, 11, 12, 13, 14, 15, 16, 17] },
    { name: "金融基础", teacher: "薛宇辰", room: "教B301", day: 2, periods: [3, 4, 5], weeks: [18] },
    { name: "金融科技基础", teacher: "李小杭", room: "教B301", day: 2, periods: [6, 7], weeks: [4, 6, 7, 8, 11, 12, 13, 14, 15, 16, 17] },
    { name: "大学英语Ⅰ", teacher: "许燕兰", room: "教B209", day: 2, periods: [8, 9], weeks: [17] },
    { name: "金融科技基础", teacher: "李小杭", room: "教B209", day: 2, periods: [8, 9], weeks: [18] },
    { name: "大学生职业生涯与规划", teacher: "梁广洋", room: "教B403", day: 3, periods: [1, 2], weeks: [11, 12, 13, 14, 15, 16, 17, 18] },
    { name: "会计基础", teacher: "徐宏菲", room: "教B409", day: 3, periods: [3, 4, 5], weeks: [3, 4, 6, 7] },
    { name: "会计基础", teacher: "徐宏菲", room: "教B409", day: 3, periods: [3, 4, 5], weeks: [8] },
    { name: "大学生心理健康教育", teacher: "林炳橼", room: "教B403", day: 3, periods: [3, 4], weeks: [11, 12, 13, 14, 15, 16, 17, 18] },
    { name: "习近平经济思想概论", teacher: "吴红宇", room: "实C305", day: 3, periods: [10, 11], weeks: [13, 14, 15, 16, 17] },
    { name: "形势与政策Ⅰ", teacher: "邱春明", room: "教B209", day: 3, periods: [10, 11, 12, 13], weeks: [11, 12] },
    { name: "金融基础", teacher: "薛宇辰", room: "教B301", day: 3, periods: [10, 11, 12], weeks: [7] },
    { name: "大学英语Ⅰ", teacher: "许燕兰", room: "教B110", day: 4, periods: [1, 2], weeks: [11, 12, 13] },
    { name: "金融基础", teacher: "薛宇辰", room: "教B509", day: 4, periods: [3, 4, 5], weeks: [3, 4, 7, 8, 11, 12, 13, 14, 15, 16, 17, 18] },
    { name: "体育Ⅰ", teacher: "陈洪武", room: "旧篮球场", day: 4, periods: [6, 7], weeks: [12] },
    { name: "习近平经济思想概论", teacher: "吴红宇", room: "实C305", day: 5, periods: [1, 2], weeks: [3, 6, 7, 8, 11, 12, 13, 14] },
    { name: "习近平经济思想概论", teacher: "吴红宇", room: "实C305", day: 5, periods: [1, 2], weeks: [15, 16, 17] },
    { name: "会计基础", teacher: "徐宏菲", room: "教B303", day: 5, periods: [3, 4, 5], weeks: [3, 6, 7, 8, 11, 12, 13, 14, 15, 16, 17] }
    ]
  };

  /* 专升本助学班（独立轨道）：每周日 8 节，与主课表互不影响 */
  const ZSB = {
    label: '专升本助学班',
    className: '26 秋插本 1 班',
    periods: [
      { no: 1, time: '09:00-09:45' },
      { no: 2, time: '09:50-10:35' },
      { no: 3, time: '10:40-11:25' },
      { no: 4, time: '11:30-12:00' },
      { no: 5, time: '14:00-14:45' },
      { no: 6, time: '14:50-15:35' },
      { no: 7, time: '15:40-16:25' },
      { no: 8, time: '16:30-17:00' }
    ],
    dates: [
      '2026-10-18', '2026-11-15', '2026-11-22', '2026-11-29',
      '2026-12-06', '2026-12-13', '2026-12-20', '2026-12-27'
    ],
    units: [
      { name: '英语（助学班）', periods: [1, 2, 3, 4], kind: 'core', hue: 42 },
      { name: '政治（助学班）', periods: [5, 6, 7, 8], kind: 'minor', hue: 212 }
    ]
  };

  /* 逐周快照种子：来自 UI 目录各周抓取的课表；空数组 = 确认无课；没有的周 = 无数据 */
  const WEEKS_SEED = {
    1: [],
    2: [],
    3: [
      { name: "会计基础", credits: 3, attr: "必修", teacher: "徐宏菲", room: "教B409", day: 3, periods: [3, 4, 5] },
      { name: "体育Ⅰ", credits: 2, attr: "必修", teacher: "", room: "", day: 3, periods: [8, 9] },
      { name: "金融基础", credits: 3, attr: "必修", teacher: "薛宇辰", room: "教B509", day: 4, periods: [3, 4, 5] },
      { name: "习近平经济思想概论", credits: 2, attr: "必修", teacher: "吴红宇", room: "实C305", day: 5, periods: [1, 2] },
      { name: "会计基础", credits: 3, attr: "必修", teacher: "徐宏菲", room: "教B303", day: 5, periods: [3, 4, 5] }
    ],
    4: [
      { name: "金融科技基础", credits: 3, attr: "必修", teacher: "李小杭", room: "教B401", day: 1, periods: [1, 2] },
      { name: "思想道德与法治", credits: 3, attr: "必修", teacher: "黄亚丽", room: "教B401", day: 1, periods: [3, 4] },
      { name: "大学英语Ⅰ", credits: 3, attr: "必修", teacher: "许燕兰", room: "教A204", day: 1, periods: [6, 7] },
      { name: "大学英语Ⅰ", credits: 3, attr: "必修", teacher: "许燕兰", room: "教B401", day: 2, periods: [1, 2] },
      { name: "思想道德与法治", credits: 3, attr: "必修", teacher: "黄亚丽", room: "教B403", day: 2, periods: [3, 4] },
      { name: "金融科技基础", credits: 3, attr: "必修", teacher: "李小杭", room: "教B301", day: 2, periods: [6, 7] },
      { name: "会计基础", credits: 3, attr: "必修", teacher: "徐宏菲", room: "教B409", day: 3, periods: [3, 4, 5] },
      { name: "体育Ⅰ", credits: 2, attr: "必修", teacher: "", room: "", day: 3, periods: [8, 9] },
      { name: "金融基础", credits: 3, attr: "必修", teacher: "薛宇辰", room: "教B509", day: 4, periods: [3, 4, 5] }
    ],
    5: [],
    6: [
      { name: "思想道德与法治", credits: 3, attr: "必修", teacher: "黄亚丽", room: "教B403", day: 2, periods: [3, 4] },
      { name: "金融科技基础", credits: 3, attr: "必修", teacher: "李小杭", room: "教B301", day: 2, periods: [6, 7] },
      { name: "会计基础", credits: 3, attr: "必修", teacher: "徐宏菲", room: "教B409", day: 3, periods: [3, 4, 5] },
      { name: "体育Ⅰ", credits: 2, attr: "必修", teacher: "", room: "", day: 3, periods: [8, 9] },
      { name: "习近平经济思想概论", credits: 2, attr: "必修", teacher: "吴红宇", room: "实C305", day: 5, periods: [1, 2] },
      { name: "会计基础", credits: 3, attr: "必修", teacher: "徐宏菲", room: "教B303", day: 5, periods: [3, 4, 5] }
    ],
    7: [
      { name: "金融科技基础", credits: 3, attr: "必修", teacher: "李小杭", room: "教B401", day: 1, periods: [1, 2] },
      { name: "思想道德与法治", credits: 3, attr: "必修", teacher: "黄亚丽", room: "教B401", day: 1, periods: [3, 4] },
      { name: "大学英语Ⅰ", credits: 3, attr: "必修", teacher: "许燕兰", room: "教A204", day: 1, periods: [6, 7] },
      { name: "大学英语Ⅰ", credits: 3, attr: "必修", teacher: "许燕兰", room: "教B401", day: 2, periods: [1, 2] },
      { name: "思想道德与法治", credits: 3, attr: "必修", teacher: "黄亚丽", room: "教B403", day: 2, periods: [3, 4] },
      { name: "金融科技基础", credits: 3, attr: "必修", teacher: "李小杭", room: "教B301", day: 2, periods: [6, 7] },
      { name: "会计基础", credits: 3, attr: "必修", teacher: "徐宏菲", room: "教B409", day: 3, periods: [3, 4, 5] },
      { name: "体育Ⅰ", credits: 2, attr: "必修", teacher: "", room: "", day: 3, periods: [8, 9] },
      { name: "金融基础", credits: 3, attr: "必修", teacher: "薛宇辰", room: "教B301", day: 3, periods: [10, 11, 12] },
      { name: "金融基础", credits: 3, attr: "必修", teacher: "薛宇辰", room: "教B509", day: 4, periods: [3, 4, 5] },
      { name: "习近平经济思想概论", credits: 2, attr: "必修", teacher: "吴红宇", room: "实C305", day: 5, periods: [1, 2] },
      { name: "会计基础", credits: 3, attr: "必修", teacher: "徐宏菲", room: "教B303", day: 5, periods: [3, 4, 5] }
    ],
    8: [
      { name: "金融科技基础", credits: 3, attr: "必修", teacher: "李小杭", room: "教B401", day: 1, periods: [1, 2] },
      { name: "思想道德与法治", credits: 3, attr: "必修", teacher: "黄亚丽", room: "教B401", day: 1, periods: [3, 4] },
      { name: "大学英语Ⅰ", credits: 3, attr: "必修", teacher: "许燕兰", room: "教A204", day: 1, periods: [6, 7] },
      { name: "大学英语Ⅰ", credits: 3, attr: "必修", teacher: "许燕兰", room: "教B401", day: 2, periods: [1, 2] },
      { name: "思想道德与法治", credits: 3, attr: "必修", teacher: "黄亚丽", room: "教B403", day: 2, periods: [3, 4] },
      { name: "金融科技基础", credits: 3, attr: "必修", teacher: "李小杭", room: "教B301", day: 2, periods: [6, 7] },
      { name: "会计基础", credits: 3, attr: "必修", teacher: "徐宏菲", room: "教B409", day: 3, periods: [3, 4, 5] },
      { name: "体育Ⅰ", credits: 2, attr: "必修", teacher: "", room: "", day: 3, periods: [8, 9] },
      { name: "金融基础", credits: 3, attr: "必修", teacher: "薛宇辰", room: "教B509", day: 4, periods: [3, 4, 5] },
      { name: "习近平经济思想概论", credits: 2, attr: "必修", teacher: "吴红宇", room: "实C305", day: 5, periods: [1, 2] },
      { name: "会计基础", credits: 3, attr: "必修", teacher: "徐宏菲", room: "教B303", day: 5, periods: [3, 4, 5] }
    ],
    9: [],
    10: [],
    11: [
      { name: "金融科技基础", credits: 3, attr: "必修", teacher: "李小杭", room: "教B401", day: 1, periods: [1, 2] },
      { name: "思想道德与法治", credits: 3, attr: "必修", teacher: "黄亚丽", room: "教B401", day: 1, periods: [3, 4] },
      { name: "国家安全教育", credits: 1, attr: "必修", teacher: "杜琰豪", room: "教B401", day: 1, periods: [10, 11, 12, 13] },
      { name: "思想道德与法治", credits: 3, attr: "必修", teacher: "黄亚丽", room: "教B403", day: 2, periods: [3, 4] },
      { name: "金融科技基础", credits: 3, attr: "必修", teacher: "李小杭", room: "教B301", day: 2, periods: [6, 7] },
      { name: "大学生职业生涯与规划", credits: 1, attr: "必修", teacher: "梁广洋", room: "教B403", day: 3, periods: [1, 2] },
      { name: "大学生心理健康教育", credits: 2, attr: "必修", teacher: "林炳橼", room: "教B403", day: 3, periods: [3, 4] },
      { name: "体育Ⅰ", credits: 2, attr: "必修", teacher: "", room: "", day: 3, periods: [8, 9] },
      { name: "形势与政策Ⅰ", credits: 0.2, attr: "必修", teacher: "邱春明", room: "教B209", day: 3, periods: [10, 11, 12, 13] },
      { name: "大学英语Ⅰ", credits: 3, attr: "必修", teacher: "许燕兰", room: "教B110", day: 4, periods: [1, 2] },
      { name: "金融基础", credits: 3, attr: "必修", teacher: "薛宇辰", room: "教B509", day: 4, periods: [3, 4, 5] },
      { name: "习近平经济思想概论", credits: 2, attr: "必修", teacher: "吴红宇", room: "实C305", day: 5, periods: [1, 2] },
      { name: "会计基础", credits: 3, attr: "必修", teacher: "徐宏菲", room: "教B303", day: 5, periods: [3, 4, 5] }
    ],
    12: [
      { name: "金融科技基础", credits: 3, attr: "必修", teacher: "李小杭", room: "教B401", day: 1, periods: [1, 2] },
      { name: "思想道德与法治", credits: 3, attr: "必修", teacher: "黄亚丽", room: "教B401", day: 1, periods: [3, 4] },
      { name: "国家安全教育", credits: 1, attr: "必修", teacher: "杜琰豪", room: "教B401", day: 1, periods: [10, 11, 12, 13] },
      { name: "思想道德与法治", credits: 3, attr: "必修", teacher: "黄亚丽", room: "教B403", day: 2, periods: [3, 4] },
      { name: "金融科技基础", credits: 3, attr: "必修", teacher: "李小杭", room: "教B301", day: 2, periods: [6, 7] },
      { name: "大学生职业生涯与规划", credits: 1, attr: "必修", teacher: "梁广洋", room: "教B403", day: 3, periods: [1, 2] },
      { name: "大学生心理健康教育", credits: 2, attr: "必修", teacher: "林炳橼", room: "教B403", day: 3, periods: [3, 4] },
      { name: "体育Ⅰ", credits: 2, attr: "必修", teacher: "", room: "", day: 3, periods: [8, 9] },
      { name: "形势与政策Ⅰ", credits: 0.2, attr: "必修", teacher: "邱春明", room: "教B209", day: 3, periods: [10, 11, 12, 13] },
      { name: "大学英语Ⅰ", credits: 3, attr: "必修", teacher: "许燕兰", room: "教B110", day: 4, periods: [1, 2] },
      { name: "金融基础", credits: 3, attr: "必修", teacher: "薛宇辰", room: "教B509", day: 4, periods: [3, 4, 5] },
      { name: "体育Ⅰ", credits: 2, attr: "必修", teacher: "陈洪武", room: "旧篮球场", day: 4, periods: [6, 7] },
      { name: "习近平经济思想概论", credits: 2, attr: "必修", teacher: "吴红宇", room: "实C305", day: 5, periods: [1, 2] },
      { name: "会计基础", credits: 3, attr: "必修", teacher: "徐宏菲", room: "教B303", day: 5, periods: [3, 4, 5] }
    ],
    13: [
      { name: "金融科技基础", credits: 3, attr: "必修", teacher: "李小杭", room: "教B401", day: 1, periods: [1, 2] },
      { name: "思想道德与法治", credits: 3, attr: "必修", teacher: "黄亚丽", room: "教B401", day: 1, periods: [3, 4] },
      { name: "国家安全教育", credits: 1, attr: "必修", teacher: "杜琰豪", room: "教B401", day: 1, periods: [10, 11, 12, 13] },
      { name: "思想道德与法治", credits: 3, attr: "必修", teacher: "黄亚丽", room: "教B403", day: 2, periods: [3, 4] },
      { name: "金融科技基础", credits: 3, attr: "必修", teacher: "李小杭", room: "教B301", day: 2, periods: [6, 7] },
      { name: "大学生职业生涯与规划", credits: 1, attr: "必修", teacher: "梁广洋", room: "教B403", day: 3, periods: [1, 2] },
      { name: "大学生心理健康教育", credits: 2, attr: "必修", teacher: "林炳橼", room: "教B403", day: 3, periods: [3, 4] },
      { name: "体育Ⅰ", credits: 2, attr: "必修", teacher: "", room: "", day: 3, periods: [8, 9] },
      { name: "习近平经济思想概论", credits: 2, attr: "必修", teacher: "吴红宇", room: "实C305", day: 3, periods: [10, 11] },
      { name: "大学英语Ⅰ", credits: 3, attr: "必修", teacher: "许燕兰", room: "教B110", day: 4, periods: [1, 2] },
      { name: "金融基础", credits: 3, attr: "必修", teacher: "薛宇辰", room: "教B509", day: 4, periods: [3, 4, 5] },
      { name: "习近平经济思想概论", credits: 2, attr: "必修", teacher: "吴红宇", room: "实C305", day: 5, periods: [1, 2] },
      { name: "会计基础", credits: 3, attr: "必修", teacher: "徐宏菲", room: "教B303", day: 5, periods: [3, 4, 5] }
    ],
    14: [
      { name: "金融科技基础", credits: 3, attr: "必修", teacher: "李小杭", room: "教B401", day: 1, periods: [1, 2] },
      { name: "思想道德与法治", credits: 3, attr: "必修", teacher: "黄亚丽", room: "教B401", day: 1, periods: [3, 4] },
      { name: "大学英语Ⅰ", credits: 3, attr: "必修", teacher: "许燕兰", room: "教B201", day: 1, periods: [6, 7] },
      { name: "国家安全教育", credits: 1, attr: "必修", teacher: "杜琰豪", room: "教B401", day: 1, periods: [10, 11, 12, 13] },
      { name: "大学英语Ⅰ", credits: 3, attr: "必修", teacher: "许燕兰", room: "教A204", day: 2, periods: [1, 2] },
      { name: "思想道德与法治", credits: 3, attr: "必修", teacher: "黄亚丽", room: "教B403", day: 2, periods: [3, 4] },
      { name: "金融科技基础", credits: 3, attr: "必修", teacher: "李小杭", room: "教B301", day: 2, periods: [6, 7] },
      { name: "大学生职业生涯与规划", credits: 1, attr: "必修", teacher: "梁广洋", room: "教B403", day: 3, periods: [1, 2] },
      { name: "大学生心理健康教育", credits: 2, attr: "必修", teacher: "林炳橼", room: "教B403", day: 3, periods: [3, 4] },
      { name: "体育Ⅰ", credits: 2, attr: "必修", teacher: "", room: "", day: 3, periods: [8, 9] },
      { name: "习近平经济思想概论", credits: 2, attr: "必修", teacher: "吴红宇", room: "实C305", day: 3, periods: [10, 11] },
      { name: "金融基础", credits: 3, attr: "必修", teacher: "薛宇辰", room: "教B509", day: 4, periods: [3, 4, 5] },
      { name: "习近平经济思想概论", credits: 2, attr: "必修", teacher: "吴红宇", room: "实C305", day: 5, periods: [1, 2] },
      { name: "会计基础", credits: 3, attr: "必修", teacher: "徐宏菲", room: "教B303", day: 5, periods: [3, 4, 5] }
    ],
    15: [
      { name: "金融科技基础", credits: 3, attr: "必修", teacher: "李小杭", room: "教B401", day: 1, periods: [1, 2] },
      { name: "思想道德与法治", credits: 3, attr: "必修", teacher: "黄亚丽", room: "教B401", day: 1, periods: [3, 4] },
      { name: "大学英语Ⅰ", credits: 3, attr: "必修", teacher: "许燕兰", room: "教B201", day: 1, periods: [6, 7] },
      { name: "金融基础", credits: 3, attr: "必修", teacher: "薛宇辰", room: "教B302", day: 2, periods: [1, 2] },
      { name: "思想道德与法治", credits: 3, attr: "必修", teacher: "黄亚丽", room: "教B403", day: 2, periods: [3, 4] },
      { name: "金融科技基础", credits: 3, attr: "必修", teacher: "李小杭", room: "教B301", day: 2, periods: [6, 7] },
      { name: "大学生职业生涯与规划", credits: 1, attr: "必修", teacher: "梁广洋", room: "教B403", day: 3, periods: [1, 2] },
      { name: "大学生心理健康教育", credits: 2, attr: "必修", teacher: "林炳橼", room: "教B403", day: 3, periods: [3, 4] },
      { name: "体育Ⅰ", credits: 2, attr: "必修", teacher: "", room: "", day: 3, periods: [8, 9] },
      { name: "习近平经济思想概论", credits: 2, attr: "必修", teacher: "吴红宇", room: "实C305", day: 3, periods: [10, 11] },
      { name: "金融基础", credits: 3, attr: "必修", teacher: "薛宇辰", room: "教B509", day: 4, periods: [3, 4, 5] },
      { name: "习近平经济思想概论", credits: 2, attr: "必修", teacher: "吴红宇", room: "实C305", day: 5, periods: [1, 2] },
      { name: "会计基础", credits: 3, attr: "必修", teacher: "徐宏菲", room: "教B303", day: 5, periods: [3, 4, 5] }
    ],
    16: [
      { name: "金融科技基础", credits: 3, attr: "必修", teacher: "李小杭", room: "教B401", day: 1, periods: [1, 2] },
      { name: "思想道德与法治", credits: 3, attr: "必修", teacher: "黄亚丽", room: "教B401", day: 1, periods: [3, 4] },
      { name: "大学英语Ⅰ", credits: 3, attr: "必修", teacher: "许燕兰", room: "教B201", day: 1, periods: [6, 7] },
      { name: "金融基础", credits: 3, attr: "必修", teacher: "薛宇辰", room: "教B302", day: 2, periods: [1, 2] },
      { name: "思想道德与法治", credits: 3, attr: "必修", teacher: "黄亚丽", room: "教B403", day: 2, periods: [3, 4] },
      { name: "金融科技基础", credits: 3, attr: "必修", teacher: "李小杭", room: "教B301", day: 2, periods: [6, 7] },
      { name: "大学生职业生涯与规划", credits: 1, attr: "必修", teacher: "梁广洋", room: "教B403", day: 3, periods: [1, 2] },
      { name: "大学生心理健康教育", credits: 2, attr: "必修", teacher: "林炳橼", room: "教B403", day: 3, periods: [3, 4] },
      { name: "体育Ⅰ", credits: 2, attr: "必修", teacher: "", room: "", day: 3, periods: [8, 9] },
      { name: "习近平经济思想概论", credits: 2, attr: "必修", teacher: "吴红宇", room: "实C305", day: 3, periods: [10, 11] },
      { name: "金融基础", credits: 3, attr: "必修", teacher: "薛宇辰", room: "教B509", day: 4, periods: [3, 4, 5] },
      { name: "习近平经济思想概论", credits: 2, attr: "必修", teacher: "吴红宇", room: "实C305", day: 5, periods: [1, 2] },
      { name: "会计基础", credits: 3, attr: "必修", teacher: "徐宏菲", room: "教B303", day: 5, periods: [3, 4, 5] }
    ],
    17: [
      { name: "金融科技基础", credits: 3, attr: "必修", teacher: "李小杭", room: "教B401", day: 1, periods: [1, 2] },
      { name: "思想道德与法治", credits: 3, attr: "必修", teacher: "黄亚丽", room: "教B401", day: 1, periods: [3, 4] },
      { name: "大学英语Ⅰ", credits: 3, attr: "必修", teacher: "许燕兰", room: "教B201", day: 1, periods: [6, 7] },
      { name: "思想道德与法治", credits: 3, attr: "必修", teacher: "黄亚丽", room: "教B403", day: 1, periods: [10, 11] },
      { name: "金融基础", credits: 3, attr: "必修", teacher: "薛宇辰", room: "教B302", day: 2, periods: [1, 2] },
      { name: "思想道德与法治", credits: 3, attr: "必修", teacher: "黄亚丽", room: "教B403", day: 2, periods: [3, 4] },
      { name: "金融科技基础", credits: 3, attr: "必修", teacher: "李小杭", room: "教B301", day: 2, periods: [6, 7] },
      { name: "大学英语Ⅰ", credits: 3, attr: "必修", teacher: "许燕兰", room: "教B209", day: 2, periods: [8, 9] },
      { name: "大学生职业生涯与规划", credits: 1, attr: "必修", teacher: "梁广洋", room: "教B403", day: 3, periods: [1, 2] },
      { name: "大学生心理健康教育", credits: 2, attr: "必修", teacher: "林炳橼", room: "教B403", day: 3, periods: [3, 4] },
      { name: "习近平经济思想概论", credits: 2, attr: "必修", teacher: "吴红宇", room: "实C305", day: 3, periods: [10, 11] },
      { name: "金融基础", credits: 3, attr: "必修", teacher: "薛宇辰", room: "教B509", day: 4, periods: [3, 4, 5] },
      { name: "习近平经济思想概论", credits: 2, attr: "必修", teacher: "吴红宇", room: "实C305", day: 5, periods: [1, 2] },
      { name: "会计基础", credits: 3, attr: "必修", teacher: "徐宏菲", room: "教B303", day: 5, periods: [3, 4, 5] }
    ],
    18: [
      { name: "思想道德与法治", credits: 3, attr: "必修", teacher: "黄亚丽", room: "教B401", day: 1, periods: [3, 4] },
      { name: "大学英语Ⅰ", credits: 3, attr: "必修", teacher: "许燕兰", room: "教B201", day: 1, periods: [6, 7] },
      { name: "思想道德与法治", credits: 3, attr: "必修", teacher: "黄亚丽", room: "教B401", day: 1, periods: [10, 11] },
      { name: "金融基础", credits: 3, attr: "必修", teacher: "薛宇辰", room: "教B301", day: 2, periods: [3, 4, 5] },
      { name: "金融科技基础", credits: 3, attr: "必修", teacher: "李小杭", room: "教B209", day: 2, periods: [8, 9] },
      { name: "大学生职业生涯与规划", credits: 1, attr: "必修", teacher: "梁广洋", room: "教B403", day: 3, periods: [1, 2] },
      { name: "大学生心理健康教育", credits: 2, attr: "必修", teacher: "林炳橼", room: "教B403", day: 3, periods: [3, 4] },
      { name: "金融基础", credits: 3, attr: "必修", teacher: "薛宇辰", room: "教B509", day: 4, periods: [3, 4, 5] }
    ],
    19: [],
    20: []
  };;;;

  /* ==================== 小工具 ==================== */

  const $ = function (sel, root) { return (root || document).querySelector(sel); };
  const $$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  function pad(n) { return String(n).padStart(2, '0'); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtNum(n) {
    const v = Number(n);
    if (!isFinite(v)) return '0';
    return Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10);
  }
  function uid() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function parseISO(s) {
    const p = String(s).split('-').map(Number);
    return new Date(p[0], (p[1] || 1) - 1, p[2] || 1);
  }
  function isoDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(d, n) {
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    t.setDate(t.getDate() + n);
    return t;
  }
  function dayNum(d) { const g = d.getDay(); return g === 0 ? 7 : g; }
  function mdLabel(d) { return pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function minutesOf(hhmm) {
    const p = String(hhmm).split(':').map(Number);
    return (p[0] || 0) * 60 + (p[1] || 0);
  }
  function durationText(mins) {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    if (h && m) return h + ' 小时 ' + m + ' 分';
    if (h) return h + ' 小时';
    return m + ' 分钟';
  }
  function hueOf(name) {
    let h = 0;
    const s = String(name || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973;
    return PALETTE[h % PALETTE.length];
  }

  /* ==================== 课程类别 → 配色 ====================
     core  专业课：金色（醒目，优先投入）
     minor 次要课（公共英语）：蓝色
     light 常规 / 水课：绿色
     同档内按课名做小幅色相偏移，既同色系又能区分不同课。
     类别可按课名自动推断，也能在编辑弹窗里手动改。
     ==================================================== */

  const KINDS = ['core', 'minor', 'light'];
  const KIND_LABEL = { core: '专业课', minor: '次要课', light: '常规 / 水课' };

  /* 每档的基准色相：金 42° / 蓝 212° / 绿 148° */
  const KIND_BASE_HUE = { core: 42, minor: 212, light: 148 };
  const KIND_SPREAD = { core: 4, minor: 7, light: 9 };

  function guessKind(name) {
    const s = String(name || '');
    if (/英语|日语|俄语|大学外语/.test(s)) return 'minor';           // 次要课
    if (/体育|思政|思想|道德|法治|形势|政策|军事|心理|职业|就业|安全|概论|修养|美育|劳动|国防|班会/.test(s)) return 'light';
    if (/金融|会计|证券|投资|保险|统计|财务|编程|数据|Python|Excel|审计|税法/.test(s)) return 'core';
    return 'light';
  }

  function unitKind(u) { return KINDS.indexOf(u.kind) !== -1 ? u.kind : guessKind(u.name); }

  function unitHue(u) {
    const kind = unitKind(u);
    const base = KIND_BASE_HUE[kind];
    const spread = KIND_SPREAD[kind] || 8;
    let h = 0;
    const s = String(u.name || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973;
    return base + (h % (spread * 2 + 1)) - spread;   // base±spread
  }

  /* 返回 {h, kind}，渲染统一走这里 */
  function unitColor(u) { return { h: unitHue(u), kind: unitKind(u) }; }

  /* ==================== 上课单元辅助 ==================== */

  function blockIndexOfPeriod(p) {
    for (let i = 0; i < BLOCKS.length; i++) if (BLOCKS[i].periods.indexOf(p) !== -1) return i;
    return p <= 2 ? 0 : BLOCKS.length - 1;
  }
  function blockOfPeriod(p) { return BLOCKS[blockIndexOfPeriod(p)]; }
  function minPeriod(u) { return Math.min.apply(null, u.periods); }
  function maxPeriod(u) { return Math.max.apply(null, u.periods); }
  function startTime(u) { return blockOfPeriod(minPeriod(u)).time.split('-')[0]; }
  function endTime(u) { return blockOfPeriod(maxPeriod(u)).time.split('-')[1]; }
  function timeText(u) { return startTime(u) + '-' + endTime(u); }
  function periodText(u) {
    return u.periods.slice().sort(function (a, b) { return a - b; })
      .map(function (p) { return pad(p); }).join('-');
  }

  /* 课次（session）：教务系统里「1-2 节」这样的一次上课就是一个课次。
     1-2 节 = 1 次课（2 小节）；3-4-5 = 3-4 与第 5 节，两个课次连上。
     连堂 = 同一门课连续占 ≥ 2 个课次（例如 1-2 与 3-4 一起上）。 */
  const SESSIONS = [[1, 2], [3, 4], [5], [6, 7], [8, 9], [10, 11], [12, 13]];

  function sessionCount(u) {
    return SESSIONS.filter(function (s) {
      return s.some(function (p) { return u.periods.indexOf(p) !== -1; });
    }).length;
  }
  function isCombined(u) { return sessionCount(u) > 1; }

  function roomText(u) { return u.room || '地点未填'; }
  function sortUnits(a, b) {
    if (a.day !== b.day) return a.day - b.day;
    return minPeriod(a) - minPeriod(b);
  }

  /* ==================== 状态 & 持久化 ==================== */

  const state = {
    schedule: {},          // 当前学期的 { 周: [unit…] }
    terms: {},             // { '2026S1': {label, termStart, totalWeeks, schedule}, … }
    activeTerm: ACTIVE_TERM,
    settings: Object.assign({}, DEFAULT_SETTINGS),
    week: 1,
    view: 'schedule',
    track: 'main',
    editingId: null,
    drawerId: null,
    copyFromWeek: null,
    kindDirty: false
  };
  let storageOK = true;

  /* ==================== 只读 / 编辑模式 ====================
     默认只读：所有改动入口先过 requireEdit()。
     控制台执行 jwxt.unlock() 后才可编辑，刷新页面自动失效。 */
  let editUnlocked = false;

  function requireEdit() {
    if (editUnlocked) return true;
    toast('只读模式：按 F12 打开控制台，执行 jwxt.unlock() 后可编辑', 'err');
    return false;
  }

  function applyEditMode() {
    document.body.classList.toggle('readonly', !editUnlocked);
    const badge = $('#modeBadge');
    if (badge) {
      badge.textContent = editUnlocked ? '编辑模式' : '只读';
      badge.classList.toggle('on', editUnlocked);
      badge.title = editUnlocked
        ? '编辑模式已开启，刷新页面后自动失效'
        : '只读模式：在控制台执行 jwxt.unlock() 可编辑';
    }
    const hint = $('#readonlyHint');
    if (hint) hint.hidden = editUnlocked;
  }

  function clearStaleData() {
    STALE_KEYS.forEach(function (k) {
      try { window.localStorage.removeItem(k); } catch (e) { /* 忽略 */ }
    });
  }

  function resetLocalData() {
    try { window.localStorage.removeItem(KEY_SETTINGS); } catch (e) { /* 忽略 */ }
    clearStaleData();
    window.location.reload();
  }

  window.jwxt = {
    unlock: function () {
      editUnlocked = true;
      applyEditMode();
      console.log('%c✓ 编辑模式已开启（本次页面有效，刷新后失效）', 'color:#0a7d4d;font-weight:bold');
      return '编辑模式已开启';
    },
    lock: function () {
      editUnlocked = false;
      applyEditMode();
      return '已回到只读模式';
    },
    status: function () {
      return editUnlocked ? 'editable' : 'readonly';
    },
    restore: function () {
      if (!editUnlocked && !window.confirm('将清除本浏览器的课表缓存并恢复内置数据，继续？')) return '已取消';
      resetLocalData();
      return '正在恢复…';
    },
    help: function () {
      console.log(
        'jwxt.unlock()   开启编辑（刷新后失效）\n' +
        'jwxt.lock()     回到只读\n' +
        'jwxt.status()   查看当前模式\n' +
        'jwxt.restore()  清除本地缓存并恢复内置课表'
      );
    }
  };

  const NARROW_MQ = window.matchMedia ? window.matchMedia('(max-width: 720px)') : null;
  function isNarrow() {
    if (NARROW_MQ) return NARROW_MQ.matches;
    return window.innerWidth <= 720;
  }

  function safeGet(key) {
    try { return window.localStorage.getItem(key); }
    catch (e) { storageOK = false; return null; }
  }
  function safeSet(key, val) {
    try { window.localStorage.setItem(key, val); }
    catch (e) { storageOK = false; }
  }

  function normalizeUnit(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const name = String(raw.name == null ? '' : raw.name).trim();
    if (!name) return null;

    let periods = Array.isArray(raw.periods) ? raw.periods : String(raw.periods || '').split(',');
    periods = periods.map(Number).filter(function (p) {
      return Number.isInteger(p) && p >= 1 && p <= MAX_PERIOD;
    });
    periods = Array.from(new Set(periods)).sort(function (a, b) { return a - b; });
    if (!periods.length) return null;

    const credits = Number(raw.credits);
    return {
      id: raw.id ? String(raw.id) : uid(),
      name: name,
      credits: Number.isFinite(credits) && credits >= 0 ? credits : 0,
      attr: ATTRS.indexOf(raw.attr) !== -1 ? raw.attr : '必修',
      // 类别：手动指定优先，否则按课名推断（只影响配色）
      kind: KINDS.indexOf(raw.kind) !== -1 ? raw.kind : guessKind(name),
      teacher: String(raw.teacher == null ? '' : raw.teacher).trim() || TEACHERS[name] || '',
      room: String(raw.room == null ? '' : raw.room).trim(),
      day: Math.min(7, Math.max(1, Number(raw.day) || 1)),
      periods: periods
    };
  }

  function cloneUnit(u) {
    return normalizeUnit(Object.assign({}, u, { id: uid() }));
  }

  function seedSchedule() {
    const out = {};
    Object.keys(WEEKS_SEED).forEach(function (w) {
      out[w] = (WEEKS_SEED[w] || []).map(cloneUnit).filter(Boolean);
    });
    return out;
  }

  function normalizeSchedule(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    Object.keys(raw).forEach(function (k) {
      const w = Number(k);
      if (!Number.isInteger(w) || w < 1 || w > 30) return;
      if (!Array.isArray(raw[k])) return;
      out[w] = raw[k].map(normalizeUnit).filter(Boolean);
    });
    return out;
  }

  /* ==================== 学期容器（年级 × 学期） ==================== */

  function buildTermSeed() {
    const out = {};
    TERM_SEED.forEach(function (t) {
      out[t.key] = {
        key: t.key,
        grade: t.grade,
        index: t.index,
        label: t.label,
        termStart: t.termStart,
        totalWeeks: DEFAULT_SETTINGS.totalWeeks,
        events: (t.events || []).map(function (e) { return Object.assign({}, e); }),
        // 只有本学期有真实快照，其他学期先留空，后面按需填
        schedule: t.key === ACTIVE_TERM ? seedSchedule() : {}
      };
    });
    return out;
  }

  function normalizeTerm(key, raw) {
    const base = TERM_SEED.filter(function (t) { return t.key === key; })[0] || {};
    const tw = Number(raw && raw.totalWeeks);
    return {
      key: key,
      grade: Number(raw && raw.grade) || base.grade || 0,
      index: Number(raw && raw.index) || base.index || 1,
      label: String((raw && raw.label) || base.label || key),
      termStart: /^\d{4}-\d{2}-\d{2}$/.test(raw && raw.termStart)
        ? raw.termStart
        : (base.termStart || DEFAULT_SETTINGS.termStart),
      totalWeeks: Number.isFinite(tw) ? Math.min(30, Math.max(1, Math.round(tw))) : (base.totalWeeks || 20),
      events: normalizeEvents(raw && raw.events, base.events),
      schedule: normalizeSchedule(raw && raw.schedule)
    };
  }

  function sortedTerms() {
    return Object.keys(state.terms).map(function (k) { return state.terms[k]; })
      .sort(function (a, b) { return (b.grade - a.grade) || (a.index - b.index); });
  }

  function loadTermInto(key) {
    const t = state.terms[key];
    if (!t) return false;
    state.activeTerm = key;
    state.schedule = t.schedule;
    state.settings.termStart = t.termStart;
    state.settings.totalWeeks = t.totalWeeks;
    return true;
  }

  function syncTermFromState() {
    const t = state.terms[state.activeTerm];
    if (!t) return;
    t.schedule = state.schedule;
    t.termStart = state.settings.termStart;
    t.totalWeeks = state.settings.totalWeeks;
  }

  function persistSettings() {
    safeSet(KEY_SETTINGS, JSON.stringify({
      theme: state.settings.theme,
      viewMode: state.settings.viewMode
    }));
  }

  function switchTerm(key) {
    if (!state.terms[key] || key === state.activeTerm) return false;
    syncTermFromState();
    loadTermInto(key);
    state.week = defaultWeek();
    buildTermSelect();
    buildFormOptions();
    renderAll();
    if (state.view === 'settings') renderSettings();
    return true;
  }

  function loadState() {
    // 主题 / 显示模式是本机偏好；课表内容每次加载都以仓库里的内置数据为准，
    // 浏览器里残留的旧修改（包括删除）不会沿用。
    const rawSettings = safeGet(KEY_SETTINGS);
    if (rawSettings) {
      try {
        const s = JSON.parse(rawSettings);
        if (s && typeof s === 'object') {
          state.settings.theme = s.theme === 'dark' ? 'dark' : 'light';
          state.settings.viewMode = ['auto', 'grid', 'day'].indexOf(s.viewMode) !== -1 ? s.viewMode : 'auto';
        }
      } catch (e) { /* 忽略损坏的设置 */ }
    }

    clearStaleData();
    state.terms = buildTermSeed();
    loadTermInto(ACTIVE_TERM);
    if (!state.schedule) state.schedule = {};
  }

  /* 手动「重新同步内置数据」：把内置周里缺失的补进当前学期，不覆盖已有周 */
  function resyncSeed() {
    const seeded = seedSchedule();
    const added = [];
    Object.keys(seeded).forEach(function (k) {
      if (!(k in state.schedule)) {
        state.schedule[k] = seeded[k];
        added.push(Number(k));
      }
    });
    if (!added.length) return [];
    return added;
  }

  /* ==================== 周次 / 日期 ==================== */

  /* ==================== 学期内事件（军训 / 假期活动等） ==================== */

  function normalizeEvents(raw, base) {
    const list = Array.isArray(raw) ? raw : (Array.isArray(base) ? base : []);
    return list.map(function (e) {
      if (!e || !/^\d{4}-\d{2}-\d{2}$/.test(e.from) || !/^\d{4}-\d{2}-\d{2}$/.test(e.to)) return null;
      return {
        type: String(e.type || 'event'),
        label: String(e.label || '事件'),
        from: e.from,
        to: e.to < e.from ? e.from : e.to
      };
    }).filter(Boolean);
  }

  function termEvents() {
    const t = state.terms[state.activeTerm];
    return (t && Array.isArray(t.events)) ? t.events : [];
  }

  /* 与某一周（周一到周日）有重叠的事件 */
  function eventsInWeek(week) {
    const mon = weekMonday(week);
    const sun = addDays(mon, 6);
    return termEvents().filter(function (ev) {
      return parseISO(ev.from) <= sun && parseISO(ev.to) >= mon;
    });
  }

  /* 某一天命中的事件 */
  function eventsOnDate(d) {
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return termEvents().filter(function (ev) {
      return parseISO(ev.from) <= day && day <= parseISO(ev.to);
    });
  }

  function militaryLabel() {
    const ev = termEvents().filter(function (e) { return e.type === 'military'; })[0];
    return ev ? ev.label : '军训';
  }

  function termStartDate() { return parseISO(state.settings.termStart); }
  function weekMonday(week) { return addDays(termStartDate(), (week - 1) * 7); }
  function weekOfDate(d) {
    const a = termStartDate();
    const b = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const days = Math.round((b.getTime() - a.getTime()) / 86400000);
    return Math.floor(days / 7) + 1;
  }
  function currentWeek() {
    const w = weekOfDate(new Date());
    return Math.min(state.settings.totalWeeks, Math.max(1, w));
  }
  function inTerm(d) {
    const w = weekOfDate(d);
    return w >= 1 && w <= state.settings.totalWeeks;
  }

  /* 该周的单元列表；undefined = 这一周没有数据（不是「确认无课」） */
  function weekUnits(week) {
    const v = state.schedule[week];
    return Array.isArray(v) ? v : undefined;
  }
  function hasWeekData(week) { return Array.isArray(state.schedule[week]); }

  function dataWeeks() {
    return Object.keys(state.schedule).map(Number)
      .filter(function (w) { return Array.isArray(state.schedule[w]); })
      .sort(function (a, b) { return a - b; });
  }

  function nearestDataWeek(week) {
    const list = dataWeeks();
    if (!list.length) return null;
    // 优先往前找，其次往后找
    let best = null;
    list.forEach(function (w) { if (w < week) best = w; });
    if (best) return best;
    return list[0];
  }

  function defaultWeek() {
    // 停在「本周」：哪怕本周还没数据，也不擅自套用别的周（课表会变，不循环）
    const cw = weekOfDate(new Date());
    if (cw >= 1 && cw <= state.settings.totalWeeks) return cw;
    return nearestDataWeek(cw) || 1;
  }

  /* ==================== Toast / 主题 ==================== */

  let toastTimer = null;
  function toast(msg, kind) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'toast show' + (kind ? ' ' + kind : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.className = 'toast' + (kind ? ' ' + kind : '');
      setTimeout(function () { el.hidden = true; }, 220);
    }, 2600);
  }

  function applyTheme() {
    const dark = state.settings.theme === 'dark';
    document.body.setAttribute('data-theme', dark ? 'dark' : 'light');
    $('#btnTheme').textContent = dark ? '☀️' : '🌙';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0f1219' : '#f4f6fb');
  }

  /* ==================== 渲染：周次条 ==================== */

  function buildTermSelect() {
    const sel = $('#termSelect');
    if (!sel) return;
    sel.innerHTML = sortedTerms().map(function (t) {
      const n = Object.keys(t.schedule || {}).length;
      return '<option value="' + t.key + '">' + t.label + (n ? '' : '（空）') + '</option>';
    }).join('');
    sel.value = state.activeTerm;
  }

  function buildWeekSelect() {
    const total = state.settings.totalWeeks;
    let html = '';
    for (let w = 1; w <= total; w++) {
      const flag = hasWeekData(w) ? '' : '（无数据）';
      html += '<option value="' + w + '">第 ' + w + ' 周' + flag + '</option>';
    }
    $('#weekSelect').innerHTML = html;
  }

  function renderWeekBar() {
    const w = state.week;
    const mon = weekMonday(w);
    const sun = addDays(mon, 6);
    $('#weekTitle').textContent = '第 ' + w + ' 周';
    const weekEv = eventsInWeek(w);
    const evTag = weekEv.length ? ' · ' + weekEv.map(function (e) { return e.label; }).join('、') : '';
    $('#weekRange').textContent = mdLabel(mon) + ' ~ ' + mdLabel(sun) + evTag + ' · 共 ' + state.settings.totalWeeks + ' 周';
    $('#weekSelect').value = String(w);

    const cw = weekOfDate(new Date());
    const isNow = w === cw;
    const tag = hasWeekData(w) ? '' : ' · 暂无数据';
    const t = state.terms[state.activeTerm];
    const tl = t ? (t.grade + ' 级·第 ' + t.index + ' 学期') : '';
    $('#brandSub').textContent = tl + ' · ' + (isNow ? ('本周 · 第 ' + w + ' 周') : ('第 ' + w + ' 周')) + tag;
    $('#btnThisWeek').disabled = isNow;
    $('#btnThisWeek').style.opacity = isNow ? '.5' : '1';
  }

  /* ==================== 渲染：课表网格 ==================== */

  function cellPlan(list) {
    const cells = BLOCKS.map(function () { return { type: 'empty' }; });
    const sorted = list.slice().sort(function (a, b) { return minPeriod(a) - minPeriod(b); });

    sorted.forEach(function (c) {
      const ps = c.periods.slice().sort(function (a, b) { return a - b; });
      const s = blockIndexOfPeriod(ps[0]);
      const e = blockIndexOfPeriod(ps[ps.length - 1]);

      if (cells[s].type === 'cell') { cells[s].courses.push(c); return; }
      if (cells[s].type === 'skip') {
        for (let i = s - 1; i >= 0; i--) {
          if (cells[i].type === 'cell') { cells[i].courses.push(c); return; }
        }
        return;
      }
      cells[s] = { type: 'cell', courses: [c], rowspan: e - s + 1 };
      for (let i = s + 1; i <= e && i < cells.length; i++) cells[i] = { type: 'skip' };
    });
    return cells;
  }

  function chipHTML(c) {
    const col = unitColor(c);
    return '<div class="chip" data-id="' + esc(c.id) + '" data-kind="' + col.kind + '" style="--h:' + col.h + '" title="' +
      esc(c.name + ' · ' + DAY_NAMES[c.day] + ' ' + periodText(c) + ' 节 · ' + roomText(c)) + '">' +
      '<div class="chip-name">' + esc(c.name) + '</div>' +
      '<div class="chip-meta">' + esc(roomText(c)) + '</div>' +
      '<div class="chip-time">' + esc(timeText(c)) + (isCombined(c) ? ' · 连堂' : '') + '</div>' +
      '</div>';
  }

  function renderTimetable() {
    const week = state.week;
    const now = new Date();
    const cw = weekOfDate(now);
    const today = dayNum(now);
    const mon = weekMonday(week);

    let head = '<tr><th class="block-cell">周 / 节次</th>';
    DAYS.forEach(function (d) {
      const date = addDays(mon, d - 1);
      const isToday = (week === cw && d === today);
      head += '<th class="' + (isToday ? 'today-col' : '') + '">' + DAY_NAMES[d] +
        '<span class="th-date">' + mdLabel(date) + '</span></th>';
    });
    head += '</tr>';
    $('#ttHead').innerHTML = head;

    const units = weekUnits(week);
    const list = units || [];

    const byDay = {};
    DAYS.forEach(function (d) { byDay[d] = []; });
    list.forEach(function (c) { (byDay[c.day] = byDay[c.day] || []).push(c); });

    const plans = {};
    DAYS.forEach(function (d) { plans[d] = cellPlan(byDay[d]); });

    let body = '';
    BLOCKS.forEach(function (b, bi) {
      body += '<tr><th class="block-cell">' +
        '<span class="blk-name">' + b.no + '</span>' +
        '<span class="blk-no">' + b.periods.map(pad).join(',') + ' 小节</span>' +
        '<span class="blk-time">' + b.time + '</span>' +
        '</th>';
      DAYS.forEach(function (d) {
        const cell = plans[d][bi];
        const isToday = (week === cw && d === today);
        const cls = 'slot' + (isToday ? ' today-col' : '');
        if (cell.type === 'skip') return;
        if (cell.type === 'empty') { body += '<td class="' + cls + '"></td>'; return; }
        body += '<td class="' + cls + '"' + (cell.rowspan > 1 ? ' rowspan="' + cell.rowspan + '"' : '') + '>' +
          cell.courses.map(chipHTML).join('') + '</td>';
      });
      body += '</tr>';
    });
    $('#ttBody').innerHTML = body;

    // 空周提示：区分「无数据」与「确认无课」
    const isEmpty = list.length === 0;
    $('#emptyWeek').hidden = !isEmpty;
    if (isEmpty) {
      const hasData = !!units;
      const evs = eventsInWeek(week);
      $('#emptyActions').hidden = evs.length > 0;
      if (evs.length) {
        $('#emptyTitle').textContent = '第 ' + week + ' 周：' + evs[0].label;
        $('#emptyNote').textContent = evs.map(function (e) {
          return mdLabel(parseISO(e.from)) + ' ~ ' + mdLabel(parseISO(e.to)) + ' ' + e.label;
        }).join('；') + '，期间不排课。';
      } else if (!hasData) {
        $('#emptyTitle').textContent = '第 ' + week + ' 周还没有课表数据';
        $('#emptyNote').textContent = '课表每周都可能变，所以不会自动沿用其他周。可以手动添加，或从最近有数据的一周复制一份再改。';
      } else {
        $('#emptyTitle').textContent = '第 ' + week + ' 周没有课程';
        $('#emptyNote').textContent = (WEEK_NOTES[week] || '这一周确认没有课') + '。';
      }
      const prev = nearestDataWeek(week);
      const canCopy = !hasData && prev && prev !== week;
      state.copyFromWeek = canCopy ? prev : null;
      const btnCopy = $('#btnEmptyCopy');
      btnCopy.hidden = !canCopy;
      if (canCopy) btnCopy.textContent = '从第 ' + prev + ' 周复制';
      $('#btnEmptyAdd').textContent = hasData ? '+ 添加课程' : '+ 手动添加课程';
    }
  }

  /* ==================== 渲染：助学班（日期列） ==================== */

  function zsbTimeRange(u) {
    const first = ZSB.periods[u.periods[0] - 1];
    const last = ZSB.periods[u.periods[u.periods.length - 1] - 1];
    return first.time.split('-')[0] + '-' + last.time.split('-')[1];
  }

  function renderZsb() {
    const wd = '日一二三四五六';
    let head = '<tr><th class="block-cell">节次</th>';
    ZSB.dates.forEach(function (iso) {
      const d = parseISO(iso);
      head += '<th>' + mdLabel(d) + '<span class="th-date">周' + wd.charAt(d.getDay()) + '</span></th>';
    });
    head += '</tr>';
    $('#zsbHead').innerHTML = head;

    let body = '';
    ZSB.periods.forEach(function (p) {
      const start = ZSB.units.filter(function (u) { return u.periods[0] === p.no; })[0];
      body += '<tr>';
      body += '<th class="block-cell"><span class="blk-no">第 ' + p.no + ' 节</span>' +
        '<span class="blk-time">' + p.time + '</span></th>';
      if (start) {
        const range = zsbTimeRange(start);
        ZSB.dates.forEach(function (iso) {
          body += '<td class="slot" rowspan="' + start.periods.length + '">' +
            '<div class="chip zsb-chip" data-kind="' + start.kind + '" style="--h:' + start.hue + '" title="' +
              esc(start.name + ' · ' + iso + ' · ' + range) + '">' +
              '<div class="chip-name">' + esc(start.name) + '</div>' +
              '<div class="chip-time">' + range + ' · ' + start.periods.length + ' 节</div>' +
            '</div></td>';
        });
      }
      body += '</tr>';
    });
    $('#zsbBody').innerHTML = body;
  }

  function switchTrack(track) {
    state.track = (track === 'zsb' || track === 'theory') ? track : 'main';
    const zsb = state.track === 'zsb';
    const theoryTrack = state.track === 'theory';
    $('#weekbar').classList.toggle('is-zsb', zsb);
    $('#weekbar').classList.toggle('is-theory', theoryTrack);
    $('#view-schedule').classList.toggle('track-zsb', zsb);
    $('#view-schedule').classList.toggle('track-theory', theoryTrack);
    $$('#trackSwitch button').forEach(function (b) {
      const on = b.dataset.track === state.track;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (zsb) renderZsb();
    if (theoryTrack) {
      try {
        renderTheory();
      } catch (err) {
        const box = $('#theoryNote');
        if (box) box.textContent = '理论课表渲染失败：' + (err && err.message ? err.message : err);
      }
    }
    if (isNarrow()) window.scrollTo({ top: 0, behavior: 'auto' });
  }



  /* ==================== 渲染：理论课表（整学期一览） ==================== */

  /* [4,5,6,7,11] -> '4-7,11' */
  function compactWeeks(weeks) {
    const arr = weeks.slice().sort(function (a, b) { return a - b; });
    if (!arr.length) return '—';
    const out = [];
    let start = arr[0], prev = arr[0];
    for (let i = 1; i <= arr.length; i++) {
      const cur = arr[i];
      if (cur === prev + 1) { prev = cur; continue; }
      out.push(start === prev ? String(start) : start + '-' + prev);
      start = prev = cur;
    }
    return out.join(',');
  }

  const THEORY_DAY = { 1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六', 7: '周日' };

  function renderTheory() {
    const units = (STATE_THEORY().units || []).slice().sort(function (a, b) {
      return a.day - b.day || a.periods[0] - b.periods[0] || a.name.localeCompare(b.name, 'zh');
    });

    $('#theoryBody').innerHTML = units.map(function (u) {
      const col = unitColor(u);
      const periods = u.periods.slice().sort(function (a, b) { return a - b; });
      const label = periods.map(function (p) { return String(p).padStart(2, '0'); }).join('-');
      const combined = periods.length >= 3;
      return '<tr>' +
        '<td data-label="课程"><span class="td-val">' +
          '<span class="course-dot" data-kind="' + col.kind + '" style="--h:' + col.h + '"></span>' +
          esc(u.name) + '</span></td>' +
        '<td data-label="任课教师">' + (u.teacher ? esc(u.teacher) : '<span class="muted">待补充</span>') + '</td>' +
        '<td data-label="地点">' + esc(u.room || '—') + '</td>' +
        '<td data-label="星期节次">' + THEORY_DAY[u.day] + ' ' + label + ' 小节' +
          (combined ? ' · 连堂' : '') + '</td>' +
        '<td data-label="周次">' + esc(compactWeeks(u.weeks)) + ' 周</td>' +
        '<td class="num" data-label="周数">' + u.weeks.length + '</td>' +
        '</tr>';
    }).join('') || '<tr><td colspan="6" class="muted" style="padding:22px;text-align:center">还没有理论课表数据。</td></tr>';

    const all = STATE_THEORY().units || [];
    const weeksAll = new Set();
    all.forEach(function (u) { u.weeks.forEach(function (w) { weeksAll.add(w); }); });
    const list = Array.from(weeksAll).sort(function (a, b) { return a - b; });
    const periodsAll = all.reduce(function (s, u) { return s + u.periods.length; }, 0);
    $('#theoryNote').textContent = '来源：' + STATE_THEORY().source +
      ' · 共 ' + all.length + ' 个课程单元 · 覆盖第 ' + (list.length ? list[0] + '–' + list[list.length - 1] : '—') +
      ' 周 · 单元节次合计 ' + periodsAll + ' 小节（不按周累加；体育等实践课不在其中）';
  }

  function STATE_THEORY() { return typeof THEORY !== 'undefined' ? THEORY : { source: '', units: [] }; }

  /* ==================== 渲染：日视图（手机） ==================== */

  function resolveMode() {
    if (state.settings.viewMode === 'grid' || state.settings.viewMode === 'day') return state.settings.viewMode;
    return isNarrow() ? 'day' : 'grid';
  }

  function renderSchedule() {
    const mode = resolveMode();
    const isDay = mode === 'day';
    $('#tableScroll').hidden = isDay;
    $('#dayList').hidden = !isDay;
    $$('#segMode button').forEach(function (b) {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
    if (isDay) renderDayList();
  }

  function renderDayList() {
    const week = state.week;
    const mon = weekMonday(week);
    const now = new Date();
    const cw = weekOfDate(now);
    const today = dayNum(now);
    const list = weekUnits(week) || [];

    const byDay = {};
    DAYS.forEach(function (d) { byDay[d] = []; });
    list.forEach(function (c) { (byDay[c.day] = byDay[c.day] || []).push(c); });

    const shown = DAYS.filter(function (d) {
      const date = addDays(mon, d - 1);
      return byDay[d].length > 0 || (week === cw && d === today) || eventsOnDate(date).length > 0;
    });

    if (!shown.length) { $('#dayList').innerHTML = ''; return; }

    $('#dayList').innerHTML = shown.map(function (d) {
      const dayList = byDay[d].slice().sort(sortUnits);
      const date = addDays(mon, d - 1);
      const isToday = (week === cw && d === today);
      const periods = dayList.reduce(function (s, c) { return s + c.periods.length; }, 0);

      const evs = eventsOnDate(date);
      const evName = evs.length ? evs.map(function (e) { return e.label; }).join('、') : '';

      const head = '<header>' +
        '<span class="dc-day">' + DAY_NAMES[d] + '</span>' +
        '<span class="dc-date">' + mdLabel(date) + '</span>' +
        (isToday ? '<span class="dc-today-tag">今天</span>' : '') +
        (evName ? '<span class="dc-event-tag">' + esc(evName) + '</span>' : '') +
        '<span class="dc-count">' + (dayList.length ? periods + ' 节' : (evName ? '全天' : '无课')) + '</span>' +
        '</header>';

      const body = dayList.length ? dayList.map(function (c) {
        const col = unitColor(c);
        return '<div class="day-item" data-id="' + esc(c.id) + '" data-kind="' + col.kind + '" style="--h:' + col.h + '">' +
          '<span class="di-bar"></span>' +
          '<span class="di-time">' + esc(startTime(c)) + '</span>' +
          '<span class="di-main">' +
          '<span class="di-name">' + esc(c.name) + '</span>' +
          '<span class="di-meta">' + esc(roomText(c)) + ' · ' + periodText(c) + ' 节 · ' + esc(timeText(c)) + '</span>' +
          '</span>' +
          '<span class="di-arrow">›</span>' +
          '</div>';
      }).join('') : (evName
        ? '<div class="day-none event">' + esc(evName) + ' · 全天，不排课</div>'
        : '<div class="day-none">这天没有课 😌</div>');

      return '<section class="day-card' + (isToday ? ' now' : '') + (evName ? ' event' : '') + '">' + head + body + '</section>';
    }).join('');
  }

  /* ==================== 渲染：侧栏 ==================== */

  function courseToday(c, now) {
    const cur = now.getHours() * 60 + now.getMinutes();
    return cur >= minutesOf(startTime(c)) && cur < minutesOf(endTime(c));
  }

  function renderToday() {
    const now = new Date();
    const cw = weekOfDate(now);
    const d = dayNum(now);
    $('#todayDate').textContent = (now.getMonth() + 1) + '月' + now.getDate() + '日 ' + DAY_SHORT[d];

    let body = '';
    const units = weekUnits(cw);
    const todayEv = eventsOnDate(now);
    if (todayEv.length) {
      body = '<div class="ev-banner">' +
        '<span class="ev-icon">🎖</span>' +
        '<span><strong>' + esc(todayEv[0].label) + '</strong> · 全天<br>' +
        '<span class="muted">' + mdLabel(parseISO(todayEv[0].from)) + ' ~ ' + mdLabel(parseISO(todayEv[0].to)) + '，期间不排课</span></span>' +
        '</div>';
    } else if (cw < 1 || cw > state.settings.totalWeeks) {
      body = '<p class="empty-hint">今天不在学期范围内。</p>';
    } else if (!units) {
      body = '<p class="empty-hint">第 ' + cw + ' 周还没有课表数据。</p>';
    } else {
      const list = units.filter(function (c) { return c.day === d; }).sort(sortUnits);
      if (!list.length) {
        body = '<p class="empty-hint">今天没有课，安心自习 📖</p>';
      } else {
        body = '<ul class="timeline">' + list.map(function (c) {
          const on = courseToday(c, now);
          return '<li class="' + (on ? 'now' : '') + '">' +
            '<span class="tl-time">' + esc(timeText(c)) + '</span>' +
            '<span class="tl-main">' +
            '<span class="tl-name">' + esc(c.name) + (on ? ' <span class="tag">上课中</span>' : '') + '</span>' +
            '<span class="tl-meta">' + esc(roomText(c)) + ' · ' + periodText(c) + ' 节</span>' +
            '</span></li>';
        }).join('') + '</ul>';
      }
    }
    $('#todayBody').innerHTML = body;
  }

  function findNextClass() {
    const now = new Date();
    const curMin = now.getHours() * 60 + now.getMinutes();

    const cwNow = weekOfDate(now);
    const todayUnits = weekUnits(cwNow);
    if (todayUnits) {
      const todayList = todayUnits.filter(function (c) { return c.day === dayNum(now); });
      for (let i = 0; i < todayList.length; i++) {
        const c = todayList[i];
        if (curMin >= minutesOf(startTime(c)) && curMin < minutesOf(endTime(c))) {
          return { kind: 'now', course: c, at: now, minutes: minutesOf(endTime(c)) - curMin, week: cwNow };
        }
      }
    }

    for (let off = 0; off <= 20; off++) {
      const d = addDays(now, off);
      if (eventsOnDate(d).length) continue;   // 军训等事件日不上课
      const w = weekOfDate(d);
      const units = weekUnits(w);
      if (!units) continue;              // 无数据周不猜
      if (w < 1 || w > state.settings.totalWeeks) continue;
      const dn = dayNum(d);
      const list = units.filter(function (c) { return c.day === dn; }).sort(sortUnits);
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(),
          Math.floor(minutesOf(startTime(c)) / 60), minutesOf(startTime(c)) % 60, 0, 0);
        if (at.getTime() > now.getTime()) {
          return { kind: 'next', course: c, at: at, minutes: Math.round((at - now) / 60000), week: w };
        }
      }
    }
    return null;
  }

  function renderNext() {
    const next = findNextClass();
    if (!next) {
      $('#nextBody').innerHTML = '<p class="empty-hint">现有课表数据里没有后续课程。</p>';
      return;
    }
    const c = next.course;
    const dayLabel = DAY_SHORT[dayNum(next.at)];
    const whenLabel = next.kind === 'now'
      ? (dayLabel + ' ' + timeText(c) + ' · ' + roomText(c))
      : ((next.at.getMonth() + 1) + '月' + next.at.getDate() + '日 ' + dayLabel + ' ' + startTime(c) + ' · ' + roomText(c));
    const count = next.kind === 'now'
      ? '<div class="next-count">' + durationText(next.minutes) + '<small>后下课</small></div>'
      : '<div class="next-count">' + durationText(next.minutes) + '<small>后上课</small></div>';

    $('#nextBody').innerHTML =
      '<div class="next-card-main">' +
      '<div class="next-name">' + esc(c.name) + '</div>' +
      '<div class="next-when">' + esc(whenLabel) + ' · 第 ' + next.week + ' 周</div>' +
      (next.kind === 'now' ? '<div class="next-when"><span class="tag">正在上课</span></div>' : '') +
      count +
      '</div>';
  }

  function renderSummary() {
    const week = state.week;
    const units = weekUnits(week);
    const list = units || [];
    const periods = list.reduce(function (s, c) { return s + c.periods.length; }, 0);

    const names = {};
    list.forEach(function (c) { if (!names[c.name]) names[c.name] = c.credits; });
    const credits = Object.keys(names).reduce(function (s, k) { return s + names[k]; }, 0);

    const rooms = [];
    list.forEach(function (c) {
      const r = c.room || '地点未填';
      if (rooms.indexOf(r) === -1) rooms.push(r);
    });

    let html = '';
    const weekEvs = eventsInWeek(week);
    if (weekEvs.length) {
      html += '<div class="ev-banner small"><span class="ev-icon">🎖</span><span><strong>' +
        esc(weekEvs[0].label) + '</strong> · ' +
        mdLabel(parseISO(weekEvs[0].from)) + ' ~ ' + mdLabel(parseISO(weekEvs[0].to)) + '</span></div>';
    }
    if (!units) {
      html += '<p class="empty-hint">第 ' + week + ' 周暂无数据（未记录，不是「无课」）。</p>';
    }
    html += '<div class="kv">' +
      '<div class="kv-row"><span>上课单元</span><span>' + list.length + ' 个</span></div>' +
      '<div class="kv-row"><span>课程门数</span><span>' + Object.keys(names).length + ' 门</span></div>' +
      '<div class="kv-row"><span>本周小节</span><span>' + periods + ' 小节 / ' + list.length + ' 次课</span></div>' +
      '<div class="kv-row"><span>本周学时</span><span>' + durationText(periods * 45) + '</span></div>' +
      '<div class="kv-row"><span>本周学分</span><span>' + fmtNum(credits) + '</span></div>' +
      '</div>';

    if (rooms.length) {
      html += '<div class="room-tags">' + rooms.map(function (r) {
        return '<span class="room-tag">' + esc(r) + '</span>';
      }).join('') + '</div>';
    }
    $('#summaryBody').innerHTML = html;
  }

  function renderSide() {
    renderToday();
    renderNext();
    renderSummary();
  }

  function findConflicts() {
    const list = weekUnits(state.week) || [];
    const out = [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.day !== b.day) continue;
        const overlap = a.periods.some(function (p) { return b.periods.indexOf(p) !== -1; });
        if (overlap) out.push([a, b]);
      }
    }
    return out;
  }

  /* ==================== 渲染：统计（跨周并集） ==================== */

  function courseStats() {
    const map = {};
    dataWeeks().forEach(function (w) {
      (state.schedule[w] || []).forEach(function (u) {
        if (!map[u.name]) {
          map[u.name] = { name: u.name, credits: u.credits, attr: u.attr, weeks: {}, units: [] };
        }
        const d = map[u.name];
        d.weeks[w] = true;
        d.units.push({ week: w, day: u.day, periods: u.periods, room: u.room });
      });
    });
    return Object.keys(map).map(function (k) {
      const d = map[k];
      d.weekCount = Object.keys(d.weeks).length;
      return d;
    }).sort(function (a, b) { return b.credits - a.credits || a.name.localeCompare(b.name, 'zh'); });
  }

  function renderStats() {
    const list = courseStats();
    const weeks = dataWeeks();
    const totalCredits = list.reduce(function (s, c) { return s + c.credits; }, 0);
    const maxLoad = weeks.reduce(function (m, w) {
      const n = (state.schedule[w] || []).reduce(function (s, u) { return s + u.periods.length; }, 0);
      return Math.max(m, n);
    }, 0);
    const unitCount = weeks.reduce(function (s, w) { return s + (state.schedule[w] || []).length; }, 0);
    const weekdaySet = {};
    weeks.forEach(function (w) {
      (state.schedule[w] || []).forEach(function (u) { weekdaySet[u.day] = true; });
    });

    const cards = [
      { label: '总学分（去重）', value: fmtNum(totalCredits), unit: '分', sub: list.length + ' 门课 · 必修 ' + fmtNum(list.filter(function (c) { return c.attr === '必修'; }).reduce(function (s, c) { return s + c.credits; }, 0)) },
      { label: '已记录周', value: String(weeks.length), unit: '周', sub: '有数据的周：第 ' + (weeks.join('、') || '—') + ' 周' },
      { label: '单周最多课节', value: String(maxLoad), unit: '节', sub: '涉及 ' + Object.keys(weekdaySet).length + ' 个上课日' },
      { label: '上课单元', value: String(unitCount), unit: '个', sub: '所有已记录周合计' }
    ];

    $('#statCards').innerHTML = cards.map(function (c) {
      return '<div class="stat-card">' +
        '<div class="stat-label">' + esc(c.label) + '</div>' +
        '<div class="stat-value">' + esc(c.value) + (c.unit ? '<small>' + esc(c.unit) + '</small>' : '') + '</div>' +
        '<div class="stat-sub">' + esc(c.sub) + '</div>' +
        '</div>';
    }).join('');

    const zsbDays = ZSB.dates.length;
    const zsbPeriodCount = ZSB.units.reduce(function (s, u) { return s + u.periods.length; }, 0);
    const zsbCards = [
      { label: '助学班门数', value: String(ZSB.units.length), unit: '门', sub: ZSB.label + ' · ' + ZSB.className },
      { label: '上课日', value: String(zsbDays), unit: '天', sub: '每周日 · 10-18 起' },
      { label: '次课', value: String(zsbDays * ZSB.units.length), unit: '次', sub: '每次 8 节' },
      { label: '总节数', value: String(zsbDays * zsbPeriodCount), unit: '节', sub: '单独统计，不计入主课表' }
    ];
    $('#zsbStatCards').innerHTML = zsbCards.map(function (c) {
      return '<div class="stat-card">' +
        '<div class="stat-label">' + esc(c.label) + '</div>' +
        '<div class="stat-value">' + esc(c.value) + (c.unit ? '<small>' + esc(c.unit) + '</small>' : '') + '</div>' +
        '<div class="stat-sub">' + esc(c.sub) + '</div>' +
        '</div>';
    }).join('');

    const maxCredits = list.reduce(function (m, c) { return Math.max(m, c.credits); }, 0) || 1;
    $('#chartCredits').innerHTML = list.map(function (c) {
      const col = unitColor(c);
      const pct = Math.max(4, Math.round(c.credits / maxCredits * 100));
      return '<div class="chart-row">' +
        '<span class="chart-name" title="' + esc(c.name) + '">' + esc(c.name) + '</span>' +
        '<span class="chart-track"><span class="chart-fill" data-kind="' + col.kind + '" style="width:' + pct + '%;--h:' + col.h + '"></span></span>' +
        '<span class="chart-val">' + fmtNum(c.credits) + ' 分</span>' +
        '</div>';
    }).join('') || '<p class="empty-hint">暂无课程。</p>';

    const cw = weekOfDate(new Date());
    let bars = '';
    for (let w = 1; w <= state.settings.totalWeeks; w++) {
      const has = hasWeekData(w);
      const n = has ? (state.schedule[w] || []).reduce(function (s, u) { return s + u.periods.length; }, 0) : 0;
      const pct = maxLoad ? Math.round(n / maxLoad * 100) : 0;
      const cls = 'weekbar-col' + (has ? (n ? ' has' : '') : ' nodata') + (w === cw ? ' now' : '');
      const tip = '第 ' + w + ' 周：' + (has ? (n + ' 节') : '暂无数据');
      bars += '<div class="' + cls + '" title="' + tip + '">' +
        '<div class="weekbar-bar" style="height:' + Math.max(has ? (n ? 6 : 2) : 2, pct) + '%"></div>' +
        '<span class="weekbar-num">' + w + '</span>' +
        '</div>';
    }
    $('#chartWeeks').innerHTML = bars;
    $('#chartWeeksHint').textContent = '灰色 = 这一周还没有课表数据（未记录，不等于无课）';

    $('#statsBody').innerHTML = list.map(function (c) {
      const col = unitColor(c);
      const last = c.units.slice().sort(function (a, b) {
        return b.week - a.week || a.day - b.day || minPeriod(a) - minPeriod(b);
      })[0];
      const lastWeek = last ? last.week : null;
      const sameWeek = last ? (state.schedule[lastWeek] || []).filter(function (u) { return u.name === c.name; }).sort(sortUnits) : [];
      const arrangement = sameWeek.map(function (u) {
        return DAY_SHORT[u.day] + ' ' + periodText(u) + ' · ' + (u.room || '地点未填');
      }).join(' / ');
      const lastPeriods = sameWeek.reduce(function (s, u) { return s + u.periods.length; }, 0);
      return '<tr>' +
        '<td data-label="课程名称"><span class="td-val"><span class="course-dot" data-kind="' + col.kind + '" style="--h:' + col.h + '"></span>' + esc(c.name) + '</span></td>' +
        '<td class="num" data-label="学分">' + fmtNum(c.credits) + '</td>' +
        '<td data-label="属性"><span class="tag">' + esc(c.attr) + '</span></td>' +
        '<td data-label="类别"><span class="kind-tag" data-kind="' + col.kind + '">' + KIND_LABEL[col.kind] + '</span></td>' +
        '<td data-label="最近周次">' + (lastWeek ? ('第 ' + lastWeek + ' 周') : '—') + '</td>' +
        '<td data-label="最近安排">' + esc(arrangement || '—') + '</td>' +
        '<td class="num" data-label="出现周数">' + c.weekCount + '</td>' +
        '<td class="num" data-label="最近周小节">' + lastPeriods + '</td>' +
        '</tr>';
    }).join('') || '<tr><td colspan="6" class="muted" style="padding:22px;text-align:center">暂无课程。</td></tr>';
  }

  /* ==================== 渲染：设置 ==================== */

  function renderSettings() {
    $('#inputTermStart').value = state.settings.termStart;
    $('#inputTotalWeeks').value = state.settings.totalWeeks;
    const mon = weekMonday(1);
    const sun = addDays(mon, 6);
    $('#termHint').textContent =
      '第 1 周 ' + isoDate(mon) + '（周一）~ ' + isoDate(sun) +
      '，学期结束 ' + isoDate(addDays(weekMonday(state.settings.totalWeeks), 6)) +
      '。填开学日也行，会自动对齐到所在周的周一。';
    const weeks = dataWeeks();
    $('#dataHint').textContent = weeks.length
      ? '已记录：第 ' + weeks.join('、') + ' 周；其余周为空数据（不会自动套用）。'
      : '还没有任何一周的记录。';

    renderTermList();
  }

  function renderTermList() {
    const box = $('#termList');
    if (!box) return;
    box.innerHTML = sortedTerms().map(function (t) {
      const n = Object.keys(t.schedule || {}).length;
      const isActive = t.key === state.activeTerm;
      const start = t.termStart;
      const end = isoDate(addDays(parseISO(t.termStart), (t.totalWeeks - 1) * 7 + 6));
      return '<div class="term-card' + (isActive ? ' active' : '') + '">' +
        '<div class="term-main">' +
        '<div class="term-label">' + esc(t.label) + (isActive ? ' <span class="term-badge">当前</span>' : '') + '</div>' +
        '<div class="term-meta">' + start + ' ~ ' + end + ' · 共 ' + t.totalWeeks + ' 周</div>' +
        '<div class="term-meta">' + (n ? ('已记录 ' + n + ' 周课表') : '暂无课表数据') + '</div>' +
        '</div>' +
        (isActive
          ? '<span class="term-now">使用中</span>'
          : '<button class="btn" data-term="' + t.key + '">切换</button>') +
        '</div>';
    }).join('');
  }

  /* ==================== 详情抽屉 ==================== */

  function openDrawer(id) {
    const list = weekUnits(state.week) || [];
    const c = list.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    state.drawerId = id;
    const col = unitColor(c);

    $('#drawerTitle').textContent = '课程详情';
    $('#drawerBody').innerHTML =
      '<div class="detail-hero" data-kind="' + col.kind + '" style="--h:' + col.h + '">' +
      '<h3>' + esc(c.name) + '</h3>' +
      '<p>' + DAY_NAMES[c.day] + ' ' + periodText(c) + ' 节 · ' + esc(timeText(c)) + '</p>' +
      '</div>' +
      '<div class="detail-list">' +
      '<div class="kv-row"><span>课程类别</span><span class="kind-tag" data-kind="' + col.kind + '">' + KIND_LABEL[col.kind] + '</span></div>' +
      '<div class="kv-row"><span>上课地点</span><span>' + esc(roomText(c)) + '</span></div>' +
      '<div class="kv-row"><span>任课教师</span><span>' + (c.teacher ? esc(c.teacher) : '未填写') + '</span></div>' +
      '<div class="kv-row"><span>学分</span><span>' + fmtNum(c.credits) + ' 分</span></div>' +
      '<div class="kv-row"><span>课程属性</span><span>' + esc(c.attr) + '</span></div>' +
      '<div class="kv-row"><span>所属周次</span><span>第 ' + state.week + ' 周</span></div>' +
      '<div class="kv-row"><span>节次</span><span>' + periodText(c) + ' 小节（' +
        sessionCount(c) + ' 个课次' + (isCombined(c) ? ' · 连堂' : '') + '）</span></div>' +
      '</div>';
    $('#drawer').hidden = false;
    $('#drawerMask').hidden = false;
  }

  function closeDrawer() {
    $('#drawer').hidden = true;
    $('#drawerMask').hidden = true;
    state.drawerId = null;
  }

  /* ==================== 编辑弹窗（只作用于当前周） ==================== */

  function buildFormOptions() {
    $('#fAttr').innerHTML = ATTRS.map(function (a) {
      return '<option value="' + a + '">' + a + '</option>';
    }).join('');
    $('#fKind').innerHTML = KINDS.map(function (k) {
      return '<option value="' + k + '">' + KIND_LABEL[k] + '</option>';
    }).join('');
    $('#fDay').innerHTML = DAYS.map(function (d) {
      return '<option value="' + d + '">' + DAY_NAMES[d] + '</option>';
    }).join('');
    let phtml = '';
    for (let p = 1; p <= MAX_PERIOD; p++) {
      phtml += '<label><input type="checkbox" value="' + p + '">第' + p + '节</label>';
    }
    $('#fPeriods').innerHTML = phtml;
    $$('#fPeriods input').forEach(function (input) {
      input.addEventListener('change', function () {
        input.parentNode.classList.toggle('on', input.checked);
      });
    });
  }

  function setPeriodChecks(periods) {
    $$('#fPeriods input').forEach(function (input) {
      const on = (periods || []).indexOf(Number(input.value)) !== -1;
      input.checked = on;
      input.parentNode.classList.toggle('on', on);
    });
  }

  function openModal(id) {
    if (!requireEdit()) return;
    buildFormOptions();
    state.editingId = id || null;
    $('#formError').hidden = true;
    $('#fScope').textContent = '仅第 ' + state.week + ' 周';

    if (id) {
      const list = weekUnits(state.week) || [];
      const c = list.filter(function (x) { return x.id === id; })[0];
      if (!c) return;
      $('#modalTitle').textContent = '编辑课程';
      $('#fId').value = c.id;
      $('#fName').value = c.name;
      $('#fCredits').value = c.credits;
      $('#fAttr').value = c.attr;
      $('#fTeacher').value = c.teacher;
      $('#fRoom').value = c.room;
      $('#fDay').value = String(c.day);
      $('#fKind').value = unitKind(c);
      state.kindDirty = true;
      setPeriodChecks(c.periods);
    } else {
      $('#modalTitle').textContent = '第 ' + state.week + ' 周 · 新增课程';
      $('#fId').value = '';
      $('#fName').value = '';
      $('#fCredits').value = '2';
      $('#fAttr').value = '必修';
      $('#fTeacher').value = '';
      $('#fRoom').value = '';
      $('#fDay').value = String(dayNum(new Date()));
      $('#fKind').value = 'light';
      state.kindDirty = false;
      setPeriodChecks([]);
    }
    $('#modalMask').hidden = false;
    closeDrawer();
    setTimeout(function () { $('#fName').focus(); }, 30);
  }

  function closeModal() {
    $('#modalMask').hidden = true;
    state.editingId = null;
  }

  function readForm() {
    const name = $('#fName').value.trim();
    const periods = $$('#fPeriods input').filter(function (i) { return i.checked; })
      .map(function (i) { return Number(i.value); })
      .sort(function (a, b) { return a - b; });
    const credits = Number($('#fCredits').value);

    if (!name) return { error: '请填写课程名称。' };
    if (!periods.length) return { error: '请至少选择一个节次。' };

    return {
      unit: {
        id: $('#fId').value || uid(),
        name: name,
        credits: Number.isFinite(credits) && credits >= 0 ? credits : 0,
        attr: $('#fAttr').value,
        kind: $('#fKind').value,
        teacher: $('#fTeacher').value.trim(),
        room: $('#fRoom').value.trim(),
        day: Number($('#fDay').value),
        periods: periods
      }
    };
  }

  function submitForm(ev) {
    ev.preventDefault();
    if (!requireEdit()) return;
    const res = readForm();
    if (res.error) {
      const box = $('#formError');
      box.textContent = res.error;
      box.hidden = false;
      return;
    }
    const week = state.week;
    const list = weekUnits(week) || [];
    const u = res.unit;
    const idx = list.findIndex(function (x) { return x.id === u.id; });
    if (idx >= 0) list[idx] = u; else list.push(u);
    state.schedule[week] = list;

    closeModal();
    renderAll();
    toast((idx >= 0 ? '已更新' : '已添加') + '：第 ' + week + ' 周', 'ok');

    const hit = findConflicts().filter(function (p) { return p[0].id === u.id || p[1].id === u.id; });
    if (hit.length) {
      const other = hit[0][0].id === u.id ? hit[0][1] : hit[0][0];
      toast('注意：与「' + other.name + '」时间重叠', 'err');
    }
  }

  /* ==================== 视图切换 / 周切换 ==================== */

  function switchView(name) {
    state.view = name;
    $$('.tab').forEach(function (t) { t.classList.toggle('active', t.dataset.view === name); });
    $$('.view').forEach(function (v) { v.classList.toggle('active', v.id === 'view-' + name); });
    if (name === 'stats') renderStats();
    if (name === 'settings') renderSettings();
    if (name === 'schedule') renderSide();
    if (isNarrow()) window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function renderAll() {
    buildWeekSelect();
    renderWeekBar();
    renderTimetable();
    renderSchedule();
    renderSide();
    if (state.view === 'stats') renderStats();
    if (state.view === 'settings') renderSettings();
  }

  function setWeek(w) {
    const total = state.settings.totalWeeks;
    state.week = Math.min(total, Math.max(1, w));
    renderWeekBar();
    renderTimetable();
    renderSchedule();
    renderSummary();
    buildWeekSelect();
    $('#weekSelect').value = String(state.week);
  }

  /* ==================== 复制 / 清空 ==================== */

  function copyWeek(from, to) {
    if (!requireEdit()) return false;
    const src = weekUnits(from);
    if (!src) { toast('第 ' + from + ' 周没有数据可复制', 'err'); return false; }
    if (from === to) return false;
    state.schedule[to] = src.map(cloneUnit).filter(Boolean);
    renderAll();
    return true;
  }

  /* ==================== 导入 / 导出 ==================== */

  function exportJSON() {
    syncTermFromState();
    const payload = {
      app: 'jwxt-timetable',
      version: 3,
      model: 'weekly-terms',
      exportedAt: new Date().toISOString(),
      settings: { theme: state.settings.theme, viewMode: state.settings.viewMode },
      activeTerm: state.activeTerm,
      terms: state.terms,
      // 兼容旧版读取：同时导出当前学期的扁平课表
      schedule: state.schedule
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    a.href = url;
    a.download = '课表备份-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' +
      pad(d.getHours()) + pad(d.getMinutes()) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    toast('已导出 JSON 备份', 'ok');
  }

  // 兼容旧版（按周次范围循环的 courses 数组）：展开成逐周快照
  function expandLegacyCourses(courses) {
    const out = {};
    courses.forEach(function (c) {
      const u = normalizeUnit(c);
      if (!u) return;
      const from = Math.max(1, Number(c.weekFrom) || 1);
      const to = Math.min(30, Number(c.weekTo) || state.settings.totalWeeks);
      const mode = c.weekMode || 'all';
      const except = (c.except || []).map(Number);
      for (let w = from; w <= to; w++) {
        if (mode === 'odd' && w % 2 === 0) continue;
        if (mode === 'even' && w % 2 === 1) continue;
        if (except.indexOf(w) !== -1) continue;
        if (!out[w]) out[w] = [];
        out[w].push(Object.assign({}, u, { id: uid() }));
      }
    });
    return out;
  }

  function importJSON(file) {
    if (!requireEdit()) return;
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const data = JSON.parse(String(reader.result));
        let schedule = null;

        // 新版：多学期（按学期合并，不会覆盖没导入的学期）
        if (data && data.terms && typeof data.terms === 'object' && Object.keys(data.terms).length) {
          const terms = {};
          Object.keys(data.terms).forEach(function (k) { terms[k] = normalizeTerm(k, data.terms[k]); });
          const keys = Object.keys(terms);
          keys.forEach(function (k) { state.terms[k] = terms[k]; });
          state.activeTerm = state.terms[data.activeTerm] ? data.activeTerm : keys[0];
          loadTermInto(state.activeTerm);
          persistTerms();
          buildTermSelect();
          state.week = defaultWeek();
          buildFormOptions();
          renderAll();
          renderSettings();
          toast('导入成功：' + keys.map(function (k) { return terms[k].label; }).join('、'), 'ok');
          return;
        }

        if (data && data.schedule && typeof data.schedule === 'object') {
          schedule = normalizeSchedule(data.schedule);
        } else if (data && Array.isArray(data.courses)) {
          schedule = expandLegacyCourses(data.courses);
        } else if (Array.isArray(data)) {
          schedule = expandLegacyCourses(data);
        }
        if (!schedule || !Object.keys(schedule).length) throw new Error('格式不对');

        state.schedule = schedule;
        if (data.settings) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(data.settings.termStart)) state.settings.termStart = data.settings.termStart;
          const tw = Number(data.settings.totalWeeks);
          if (Number.isFinite(tw)) state.settings.totalWeeks = Math.min(30, Math.max(1, Math.round(tw)));
        }
        persistSettings();
        state.week = defaultWeek();
        renderAll();
        toast('导入成功：' + dataWeeks().length + ' 周记录', 'ok');
      } catch (e) {
        toast('导入失败：JSON 格式不正确', 'err');
      }
    };
    reader.onerror = function () { toast('读取文件失败', 'err'); };
    reader.readAsText(file, 'utf-8');
  }

  /* ==================== 事件 ==================== */

  function bindEvents() {
    $('#tabs').addEventListener('click', function (e) {
      const btn = e.target.closest('.tab');
      if (btn) switchView(btn.dataset.view);
    });

    const termSel = $('#termSelect');
    if (termSel) {
      termSel.addEventListener('change', function (e) {
        const key = e.target.value;
        if (switchTerm(key)) {
          toast('已切换到 ' + state.terms[key].label, 'ok');
          if (state.view !== 'schedule' && state.view !== 'settings') switchView('schedule');
        }
        buildTermSelect();
      });
    }

    const termList = $('#termList');
    if (termList) {
      termList.addEventListener('click', function (e) {
        const btn = e.target.closest('button[data-term]');
        if (!btn) return;
        const key = btn.getAttribute('data-term');
        if (switchTerm(key)) {
          toast('已切换到 ' + state.terms[key].label, 'ok');
          renderSettings();
        }
      });
    }

    $('#btnPrevWeek').addEventListener('click', function () { setWeek(state.week - 1); });
    $('#btnNextWeek').addEventListener('click', function () { setWeek(state.week + 1); });
    $('#weekSelect').addEventListener('change', function (e) { setWeek(Number(e.target.value)); });
    $('#btnThisWeek').addEventListener('click', function () {
      setWeek(currentWeek());
      if (!hasWeekData(state.week)) toast('本周（第 ' + state.week + ' 周）还没有课表数据', 'err');
    });

    $('#btnTheme').addEventListener('click', function () {
      state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
      persistSettings();
      applyTheme();
    });
    $('#btnPrint').addEventListener('click', function () {
      switchView('schedule');
      setTimeout(function () { window.print(); }, 60);
    });

    $('#btnAddCourse').addEventListener('click', function () { openModal(null); });
    $('#btnEmptyAdd').addEventListener('click', function () { openModal(null); });

    $('#ttBody').addEventListener('click', function (e) {
      const chip = e.target.closest('.chip');
      if (chip) openDrawer(chip.dataset.id);
    });
    $('#dayList').addEventListener('click', function (e) {
      const item = e.target.closest('.day-item');
      if (item) openDrawer(item.dataset.id);
    });

    $('#btnEmptyCopy').addEventListener('click', function () {
      if (!requireEdit()) return;
      const from = state.copyFromWeek;
      if (!from) return;
      if (!window.confirm('把第 ' + from + ' 周的课表复制到第 ' + state.week + ' 周？会覆盖这一周现有内容。')) return;
      if (copyWeek(from, state.week)) toast('已从第 ' + from + ' 周复制', 'ok');
    });

    $('#trackSwitch').addEventListener('click', function (e) {
      const btn = e.target.closest('button[data-track]');
      if (btn) switchTrack(btn.dataset.track);
    });

    $('#segMode').addEventListener('click', function (e) {
      const btn = e.target.closest('button[data-mode]');
      if (!btn) return;
      state.settings.viewMode = btn.dataset.mode;
      persistSettings();
      renderSchedule();
    });

    $('#drawerClose').addEventListener('click', closeDrawer);
    $('#drawerMask').addEventListener('click', closeDrawer);
    $('#drawerEdit').addEventListener('click', function () {
      if (state.drawerId) openModal(state.drawerId);
    });
    $('#drawerDelete').addEventListener('click', function () {
      if (!requireEdit()) return;
      const id = state.drawerId;
      if (!id) return;
      const list = weekUnits(state.week) || [];
      const c = list.filter(function (x) { return x.id === id; })[0];
      if (!c) return;
      if (!window.confirm('从第 ' + state.week + ' 周删除「' + c.name + '」（' + DAY_SHORT[c.day] + ' ' + periodText(c) + ' 节）？其他周不受影响。')) return;
      state.schedule[state.week] = list.filter(function (x) { return x.id !== id; });
      closeDrawer();
      renderAll();
      toast('已从第 ' + state.week + ' 周删除', 'ok');
    });

    $('#modalClose').addEventListener('click', closeModal);
    $('#modalCancel').addEventListener('click', closeModal);
    $('#modalMask').addEventListener('click', function (e) {
      if (e.target === $('#modalMask')) closeModal();
    });
    $('#courseForm').addEventListener('submit', submitForm);
    $('#fKind').addEventListener('change', function () { state.kindDirty = true; });
    $('#fName').addEventListener('input', function () {
      if (!state.kindDirty) $('#fKind').value = guessKind($('#fName').value.trim());
    });

    $('#btnSaveSettings').addEventListener('click', function () {
      if (!requireEdit()) return;
      const raw = $('#inputTermStart').value;
      const tw = Number($('#inputTotalWeeks').value);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) { toast('请选择开学日 / 第 1 周内的日期', 'err'); return; }
      if (!Number.isFinite(tw) || tw < 1 || tw > 30) { toast('总周数需在 1–30 之间', 'err'); return; }

      const picked = parseISO(raw);
      const monday = addDays(picked, -(dayNum(picked) - 1));
      state.settings.termStart = isoDate(monday);
      state.settings.totalWeeks = Math.round(tw);

      // 超出总周数的快照丢弃
      Object.keys(state.schedule).forEach(function (k) {
        if (Number(k) > state.settings.totalWeeks) delete state.schedule[k];
      });

      persistSettings();
      state.week = Math.min(state.week, state.settings.totalWeeks);
      $('#inputTermStart').value = state.settings.termStart;
      renderAll();
      renderSettings();
      toast(dayNum(picked) !== 1
        ? '已保存：' + raw + ' 是周' + '一二三四五六日'.charAt(dayNum(picked) - 1) + '，第 1 周对齐为 ' + state.settings.termStart
        : '设置已保存', 'ok');
    });

    $('#btnExport').addEventListener('click', exportJSON);
    $('#btnImport').addEventListener('click', function () {
      if (!requireEdit()) return;
      $('#fileImport').click();
    });

    const btnResync = $('#btnResyncSeed');
    if (btnResync) {
      btnResync.addEventListener('click', function () {
        if (!requireEdit()) return;
        const added = resyncSeed();
        if (!added.length) { toast('已经是最新，没有缺失的周', 'ok'); return; }
        renderAll();
        renderSettings();
        toast('已补入：第 ' + added.join('、') + ' 周', 'ok');
      });
    }
    $('#fileImport').addEventListener('change', function (e) {
      if (!requireEdit()) { e.target.value = ''; return; }
      const f = e.target.files && e.target.files[0];
      if (f) importJSON(f);
      e.target.value = '';
    });
    $('#btnWipe').addEventListener('click', function () {
      if (!requireEdit()) return;
      const label = (state.terms[state.activeTerm] || {}).label || '';
      if (!window.confirm('清空「' + label + '」的全部周次？其他学期不受影响，建议先导出备份。')) return;
      state.schedule = {};
      renderAll();
      toast('已清空本学期的所有周', 'ok');
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!$('#modalMask').hidden) { closeModal(); return; }
        if (!$('#drawer').hidden) { closeDrawer(); return; }
      }
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
      if (state.view !== 'schedule' || state.track !== 'main') return;
      if (e.key === 'ArrowLeft') setWeek(state.week - 1);
      if (e.key === 'ArrowRight') setWeek(state.week + 1);
      if (e.key === 't' || e.key === 'T') setWeek(currentWeek());
    });

    // 手机：左右滑动切周
    let touchX = 0, touchY = 0, touchTarget = null;
    $('#view-schedule').addEventListener('touchstart', function (e) {
      const t = e.touches[0];
      touchX = t.clientX; touchY = t.clientY; touchTarget = e.target;
    }, { passive: true });
    $('#view-schedule').addEventListener('touchend', function (e) {
      if (!touchTarget || !isNarrow() || state.track !== 'main') return;
      const scroll = $('#tableScroll');
      const scrollable = scroll && !scroll.hidden && scroll.scrollWidth > scroll.clientWidth + 4;
      if (scrollable && touchTarget.closest && touchTarget.closest('#tableScroll')) return;
      if (touchTarget.closest && touchTarget.closest('.day-item')) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchX, dy = t.clientY - touchY;
      if (Math.abs(dx) > 60 && Math.abs(dy) < 45) setWeek(state.week + (dx < 0 ? 1 : -1));
      touchTarget = null;
    }, { passive: true });

    let resizeTimer = null;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (state.settings.viewMode === 'auto') renderSchedule();
      }, 150);
    });
    if (NARROW_MQ) {
      const onMQ = function () { if (state.settings.viewMode === 'auto') renderSchedule(); };
      if (NARROW_MQ.addEventListener) NARROW_MQ.addEventListener('change', onMQ);
      else if (NARROW_MQ.addListener) NARROW_MQ.addListener(onMQ);
    }

    setInterval(function () {
      if (state.view === 'schedule' && $('#drawer').hidden && $('#modalMask').hidden) {
        renderToday();
        renderNext();
      }
    }, 30000);
  }

  /* ==================== 启动 ==================== */

  function init() {
    loadState();
    applyTheme();
    state.week = defaultWeek();
    buildTermSelect();
    buildFormOptions();
    bindEvents();
    renderAll();
    applyEditMode();

    if (!storageOK) {
      toast('本机禁止本地存储：主题等偏好不会保存，课表内容以页面内置数据为准', 'err');
    } else if (!hasWeekData(state.week)) {
      const prev = nearestDataWeek(state.week);
      if (prev) toast('第 ' + state.week + ' 周还没记录，可用「从第 ' + prev + ' 周复制」', 'ok');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
