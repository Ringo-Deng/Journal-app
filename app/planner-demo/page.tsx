"use client";

import { useState } from "react";
import styles from "./planner-demo.module.css";

const tabs = [
  ["opening", "月启"],
  ["calendar", "月计划"],
  ["focus", "目标习惯"],
  ["weekly", "周计划"],
  ["daily", "日常记录"],
  ["review", "月末拾光"],
] as const;
type Tab = (typeof tabs)[number][0];

const notes: Record<number, string> = {
  3: "整理夏日照片",
  8: "和朋友喝咖啡",
  15: "看展览",
  22: "秋分 · 散步",
  28: "月末整理",
};
const days = Array.from({ length: 42 }, (_, i) => ({
  day: i === 0 ? 31 : i > 30 ? i - 30 : i,
  faded: i === 0 || i > 30,
}));

function Opening() {
  return (
    <div className={styles.pages}>
      <section className={`${styles.page} ${styles.opening}`}>
        <span className={styles.eyebrow}>COLLECT THE LITTLE THINGS</span>
        <strong>09</strong>
        <h2>九月拾光</h2>
        <p>风开始变得轻一点。</p>
        <i>✿</i>
      </section>
      <section className={`${styles.page} ${styles.intro}`}>
        <em>this month</em>
        <h3>想慢慢完成的事</h3>
        <ol>
          <li>整理一册夏天的照片</li>
          <li>去两家没去过的小店</li>
          <li>认真吃几次早餐</li>
        </ol>
        <blockquote>“把普通的一天，认真收藏起来。”</blockquote>
        <small>
          SEPTEMBER
          <br />
          <b>01 — 30</b>
        </small>
      </section>
    </div>
  );
}

function Calendar() {
  return (
    <div className={styles.calendar}>
      <header>
        <small>2026</small>
        <strong>SEPTEMBER</strong>
        <em>九月</em>
      </header>
      <div className={styles.weekdays}>
        {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className={styles.grid}>
        {days.map(({ day, faded }, i) => (
          <div className={faded ? styles.faded : ""} key={`${day}-${i}`}>
            <b>{day}</b>
            {!faded && notes[day] && <small>{notes[day]}</small>}
          </div>
        ))}
      </div>
      <footer>
        <b>本月三件事</b>
        <span>完成相册</span>
        <span>每周散步</span>
        <span>留一天空白</span>
        <small>FREE SPACE · 贴照片、票根和喜欢的纸片</small>
      </footer>
    </div>
  );
}

function Focus() {
  const track = Array.from({ length: 15 }, (_, i) => i + 1);
  return (
    <div className={styles.pages}>
      <section className={`${styles.page} ${styles.focus}`}>
        <span className={styles.eyebrow}>MONTHLY FOCUS</span>
        <h2>本月想靠近的生活</h2>
        <blockquote>
          把节奏放慢，
          <br />
          把喜欢的事做深一点。
        </blockquote>
        <div className={styles.cards}>
          {[
            ["01", "完成", "夏日照片册"],
            ["02", "保持", "一周三次散步"],
            ["03", "尝试", "新的早餐配方"],
          ].map((x) => (
            <article key={x[0]}>
              <b>{x[0]}</b>
              <small>{x[1]}</small>
              <p>{x[2]}</p>
            </article>
          ))}
        </div>
        <div className={styles.todo}>
          <b>本月清单</b>
          <p>□ 预约洗牙</p>
          <p>□ 给朋友寄明信片</p>
          <p>□ 整理书架</p>
        </div>
      </section>
      <section className={`${styles.page} ${styles.habits}`}>
        <span className={styles.eyebrow}>LITTLE RHYTHMS</span>
        <h2>生活轨迹</h2>
        <div className={styles.habitTable}>
          <header>
            <span>习惯</span>
            {track.map((n) => (
              <b key={n}>{n}</b>
            ))}
          </header>
          {["早睡", "散步", "阅读", "好好吃饭", "记录心情"].map((h, r) => (
            <div key={h}>
              <span>{h}</span>
              {track.map((n) => (
                <i className={(n + r * 2) % 4 ? styles.checked : ""} key={n} />
              ))}
            </div>
          ))}
        </div>
        <div className={styles.moods}>
          <span>这个月的颜色</span>
          {track.slice(0, 5).map((n) => (
            <i key={n} />
          ))}
        </div>
        <aside>
          <b>想记住</b>
          <p>________________________________</p>
          <p>________________________________</p>
        </aside>
      </section>
    </div>
  );
}

function Weekly() {
  const week = [
    ["MON", "14", "整理计划"],
    ["TUE", "15", "看展览"],
    ["WED", "16", ""],
    ["THU", "17", "咖啡店"],
    ["FRI", "18", ""],
    ["SAT", "19", "散步"],
    ["SUN", "20", ""],
  ];
  return (
    <div className={styles.week}>
      <header>
        <span>WEEK 38</span>
        <strong>SEPTEMBER · 14—20</strong>
        <em>这一周，慢慢来。</em>
      </header>
      <div>
        {week.map(([name, date, note]) => (
          <article key={name}>
            <b>{name}</b>
            <strong>{date}</strong>
            <p>{note}</p>
            {[1, 2, 3, 4].map((n) => (
              <span key={n} />
            ))}
          </article>
        ))}
      </div>
      <footer>
        <section>
          <b>本周重点</b>
          <p>□ 完成照片挑选　□ 周末留白</p>
        </section>
        <section>
          <b>好事发生</b>
          <p>________________________________</p>
        </section>
      </footer>
    </div>
  );
}

function Daily() {
  return (
    <div className={styles.pages}>
      <section className={`${styles.page} ${styles.daily}`}>
        <header>
          <strong>15</strong>
          <span>
            SEPTEMBER
            <br />
            TUESDAY
          </span>
        </header>
        <aside>
          <b>TODAY'S FOCUS</b>
          <p>下班后去看期待很久的展</p>
        </aside>
        {["08", "10", "12", "14", "16", "18", "20", "22"].map((h) => (
          <div className={styles.time} key={h}>
            <b>{h}</b>
            <span />
          </div>
        ))}
      </section>
      <section className={`${styles.page} ${styles.memory}`}>
        <i className={styles.tape} />
        <div className={styles.photo}>PHOTO</div>
        <h2>秋天从一场展览开始</h2>
        <p>窗外的光落在画框上，整个下午都很安静。回家时绕了一点远路，风里已经有桂花的味道。</p>
        <small>ADMIT ONE · 2026.09.15</small>
        <em>✿</em>
      </section>
    </div>
  );
}

function Review() {
  return (
    <div className={styles.pages}>
      <section className={`${styles.page} ${styles.review}`}>
        <span className={styles.eyebrow}>MONTH IN REVIEW</span>
        <h2>九月，留下了什么</h2>
        {[
          ["最喜欢的一天", "15日，看完展览后慢慢走回家。"],
          ["完成的事", "整理了相册，也重新开始阅读。"],
          ["新发现", "不排满的周末反而记得更清楚。"],
        ].map(([a, b]) => (
          <article key={a}>
            <b>{a}</b>
            <p>{b}</p>
          </article>
        ))}
      </section>
      <section className={`${styles.page} ${styles.gallery}`}>
        <div className={styles.photos}>
          <i />
          <i />
          <i />
        </div>
        <section>
          <span>NEXT MONTH</span>
          <h3>十月想继续</h3>
          <p>□ 每周留一个无安排的晚上</p>
          <p>□ 做一本秋天的颜色册</p>
          <p>□ 多拍几张普通日子的照片</p>
        </section>
        <aside>
          <span>这个月的心情</span>
          <strong>8.5</strong>
          <em>/ 10</em>
        </aside>
      </section>
    </div>
  );
}

export default function PlannerDemo() {
  const [tab, setTab] = useState<Tab>("calendar");
  return (
    <main className={styles.demo}>
      <header className={styles.top}>
        <div>
          <span>拾光手帐 · 内页套装 DEMO</span>
          <h1>一本月度手帐，从计划到回望</h1>
        </div>
        <a href="/">返回手帐</a>
      </header>
      <div className={styles.workspace}>
        <nav>
          <p>2026 · SEPTEMBER</p>
          {tabs.map(([id, name], i) => (
            <button className={tab === id ? styles.active : ""} onClick={() => setTab(id)} key={id}>
              <b>{String(i + 1).padStart(2, "0")}</b>
              <span>{name}</span>
            </button>
          ))}
          <small>
            一套包含 8 个跨页
            <br />
            现有日记记录方式保留
          </small>
        </nav>
        <section className={styles.stage}>
          <header>
            <span>{tabs.find((x) => x[0] === tab)?.[1]}</span>
            <small>点击左侧切换内页</small>
          </header>
          <div className={styles.book}>
            {tab === "opening" ? (
              <Opening />
            ) : tab === "calendar" ? (
              <Calendar />
            ) : tab === "focus" ? (
              <Focus />
            ) : tab === "weekly" ? (
              <Weekly />
            ) : tab === "daily" ? (
              <Daily />
            ) : (
              <Review />
            )}
          </div>
          <p>结构线属于内页底层；照片、文字、贴纸仍可在上方自由编辑。</p>
        </section>
      </div>
    </main>
  );
}
