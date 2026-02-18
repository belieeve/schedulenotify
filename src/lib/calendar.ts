import { startOfMonth, endOfMonth, eachDayOfInterval, format, isSameDay, startOfWeek, endOfWeek } from 'date-fns';
import { ja } from 'date-fns/locale';

export interface CalendarEvent {
    id: string;
    title: string;
    date: string; // ISO string for serialization
    description?: string;
    color?: string;
}

export const EVENT_COLORS = [
    { name: 'blue', value: '#4f46e5' },
    { name: 'green', value: '#10b981' },
    { name: 'red', value: '#ef4444' },
    { name: 'purple', value: '#8b5cf6' },
    { name: 'orange', value: '#f59e0b' },
];

export const getMonthDays = (date: Date) => {
    const start = startOfWeek(startOfMonth(date), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(date), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
};

export const filterEventsByDate = (events: CalendarEvent[], date: Date) => {
    return events.filter(event => isSameDay(new Date(event.date), date));
};

export const formatEventTime = (dateStr: string) => {
    return format(new Date(dateStr), 'HH:mm');
};

// LocalStorage persistence
const STORAGE_KEY = 'ai-secretary-events';

export const loadEvents = (): CalendarEvent[] => {
    if (typeof window === 'undefined') return [];
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (data) return JSON.parse(data);
    } catch {
        // ignore
    }
    return getDefaultEvents();
};

export const saveEvents = (events: CalendarEvent[]) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
};

// Default events for first-time users
const getDefaultEvents = (): CalendarEvent[] => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 5);

    return [
        {
            id: crypto.randomUUID(),
            title: 'ランチミーティング',
            date: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0).toISOString(),
            description: '佐藤さんと渋谷で',
            color: 'blue',
        },
        {
            id: crypto.randomUUID(),
            title: 'ジム',
            date: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 18, 0).toISOString(),
            description: '背中トレーニング',
            color: 'green',
        },
        {
            id: crypto.randomUUID(),
            title: '美容院',
            date: new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 11, 0).toISOString(),
            description: '11:00予約',
            color: 'purple',
        },
        {
            id: crypto.randomUUID(),
            title: 'プロジェクト会議',
            date: new Date(nextWeek.getFullYear(), nextWeek.getMonth(), nextWeek.getDate(), 14, 0).toISOString(),
            description: 'Zoom会議',
            color: 'red',
        },
    ];
};

// ------- AI Chat Helpers -------

export const parseAIResponse = (
    input: string,
    events: CalendarEvent[]
): { text: string; action?: { type: 'add' | 'list'; event?: Partial<CalendarEvent> } } => {
    const today = new Date();
    const todayStr = format(today, 'M月d日');

    // Query: 今日の予定
    if (input.includes('今日の予定') || input.includes('今日は何')) {
        const todayEvents = filterEventsByDate(events, today);
        if (todayEvents.length > 0) {
            const list = todayEvents
                .map(e => `📌 ${formatEventTime(e.date)} ${e.title}${e.description ? ` - ${e.description}` : ''}`)
                .join('\n');
            return { text: `${todayStr}の予定は${todayEvents.length}件です！\n\n${list}` };
        }
        return { text: `${todayStr}の予定は特にありません 🎉\nのんびりできますね！` };
    }

    // Query: 明日の予定
    if (input.includes('明日の予定') || input.includes('明日は何')) {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowEvents = filterEventsByDate(events, tomorrow);
        const tomorrowStr = format(tomorrow, 'M月d日');
        if (tomorrowEvents.length > 0) {
            const list = tomorrowEvents
                .map(e => `📌 ${formatEventTime(e.date)} ${e.title}${e.description ? ` - ${e.description}` : ''}`)
                .join('\n');
            return { text: `${tomorrowStr}の予定は${tomorrowEvents.length}件です！\n\n${list}` };
        }
        return { text: `${tomorrowStr}の予定は特にありません 😊\nゆっくり休めますね！` };
    }

    // Query: 今週の予定
    if (input.includes('今週') || input.includes('この週')) {
        const weekStart = startOfWeek(today, { weekStartsOn: 0 });
        const weekEnd = endOfWeek(today, { weekStartsOn: 0 });
        const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

        let result = '📅 今週の予定：\n\n';
        let totalCount = 0;
        for (const day of weekDays) {
            const dayEvents = filterEventsByDate(events, day);
            if (dayEvents.length > 0) {
                result += `【${format(day, 'M/d(E)', { locale: ja })}】\n`;
                for (const e of dayEvents) {
                    result += `  ・${formatEventTime(e.date)} ${e.title}\n`;
                    totalCount++;
                }
            }
        }
        if (totalCount === 0) {
            return { text: '今週の予定はありません！🎉 フリーな一週間ですね。' };
        }
        return { text: result.trim() };
    }

    // Add event intent
    if (input.includes('予定') && (input.includes('追加') || input.includes('入れて') || input.includes('登録'))) {
        return {
            text: '予定を追加しますね！📝\nカレンダーの「＋追加」ボタンから、日時と内容を入力してください。\n\n（ヒント：日付をクリックしてから「＋追加」を押すと、その日の予定として追加できます）',
        };
    }

    // 挨拶
    if (input.includes('おはよう') || input.includes('こんにちは') || input.includes('こんばんは')) {
        const hour = today.getHours();
        let greeting = 'こんにちは';
        if (hour < 10) greeting = 'おはようございます';
        else if (hour >= 18) greeting = 'こんばんは';

        const todayEvents = filterEventsByDate(events, today);
        if (todayEvents.length > 0) {
            return { text: `${greeting}！😊\n今日は${todayEvents.length}件の予定がありますよ。「今日の予定」と聞いてみてください！` };
        }
        return { text: `${greeting}！😊\n今日の予定は特にありません。何かお手伝いできることはありますか？` };
    }

    // ありがとう
    if (input.includes('ありがとう') || input.includes('助かる')) {
        return { text: 'どういたしまして！😄\nいつでもお気軽にどうぞ！' };
    }

    // Help
    if (input.includes('使い方') || input.includes('ヘルプ') || input.includes('何ができる')) {
        return {
            text: '📖 こんなことができます：\n\n' +
                '💬 「今日の予定」→ 今日のスケジュールを確認\n' +
                '💬 「明日の予定」→ 明日のスケジュールを確認\n' +
                '💬 「今週の予定」→ 週間スケジュールを確認\n' +
                '💬 「予定を追加」→ 追加方法をガイド\n\n' +
                '📅 カレンダーの日付をクリックして詳細を確認できます！'
        };
    }

    // Default
    return {
        text: `「${input}」について承知しました 👍\n\n予定の確認は「今日の予定」「明日の予定」「今週の予定」と話しかけてみてくださいね。\n使い方は「ヘルプ」と入力すると確認できます！`,
    };
};
