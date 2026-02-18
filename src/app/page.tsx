'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Calendar as CalendarIcon, ChevronLeft, ChevronRight, X, Plus, Trash2, Bell, BellOff } from 'lucide-react';
import { format, isSameDay, isSameMonth, addMonths, subMonths } from 'date-fns';
import { ja } from 'date-fns/locale';
import {
  getMonthDays,
  CalendarEvent,
  EVENT_COLORS,
  filterEventsByDate,
  formatEventTime,
  loadEvents,
  saveEvents,
  parseAIResponse,
} from '@/lib/calendar';

// ---- Notification Helper (Browser API, no cost) ----
const requestNotificationPermission = async () => {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
};

const scheduleNotification = (event: CalendarEvent) => {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const eventDate = new Date(event.date);
  const now = new Date();
  const diff = eventDate.getTime() - now.getTime() - 10 * 60 * 1000; // 10 min before

  if (diff > 0 && diff < 24 * 60 * 60 * 1000) {
    setTimeout(() => {
      new Notification('📅 まもなく予定があります', {
        body: `${formatEventTime(event.date)} ${event.title}${event.description ? '\n' + event.description : ''}`,
        icon: '/favicon.ico',
      });
    }, diff);
  }
};

// ---- Add Event Modal ----
function AddEventModal({
  isOpen,
  onClose,
  onAdd,
  defaultDate,
}: {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (event: CalendarEvent) => void;
  defaultDate: Date;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(format(defaultDate, 'yyyy-MM-dd'));
  const [time, setTime] = useState('12:00');
  const [color, setColor] = useState('blue');

  useEffect(() => {
    setDate(format(defaultDate, 'yyyy-MM-dd'));
  }, [defaultDate]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!title.trim()) return;
    const [y, m, d] = date.split('-').map(Number);
    const [h, min] = time.split(':').map(Number);
    const eventDate = new Date(y, m - 1, d, h, min);

    onAdd({
      id: crypto.randomUUID(),
      title: title.trim(),
      description: description.trim() || undefined,
      date: eventDate.toISOString(),
      color,
    });

    setTitle('');
    setDescription('');
    setTime('12:00');
    setColor('blue');
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>📝 予定を追加</h3>
          <button className="btn-ghost" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>タイトル *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例：ランチミーティング"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>メモ</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="例：渋谷のカフェで"
            />
          </div>
          <div className="flex gap-3">
            <div className="form-group flex-1">
              <label>日付</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="form-group flex-1">
              <label>時間</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label>カラー</label>
            <div className="color-options">
              {EVENT_COLORS.map((c) => (
                <div
                  key={c.name}
                  className={`color-option ${color === c.name ? 'selected' : ''}`}
                  style={{ backgroundColor: c.value, color: c.value }}
                  onClick={() => setColor(c.name)}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>
            キャンセル
          </button>
          <button className="btn-save" onClick={handleSubmit} disabled={!title.trim()}>
            追加する
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Main App ----
export default function Home() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showAddModal, setShowAddModal] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Chat state
  const [messages, setMessages] = useState<{ id: string; text: string; sender: 'user' | 'ai' }[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load data on mount
  useEffect(() => {
    const loaded = loadEvents();
    setEvents(loaded);
    setIsLoaded(true);

    // Check notification permission
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationsEnabled(Notification.permission === 'granted');
    }

    // Initial greeting
    const hour = new Date().getHours();
    let greeting = 'こんにちは';
    if (hour < 10) greeting = 'おはようございます';
    else if (hour >= 18) greeting = 'こんばんは';

    setMessages([
      {
        id: '1',
        text: `${greeting}！😊 あなたの予定管理をお手伝いします。\n\n「今日の予定」「明日の予定」「今週の予定」などと聞いてみてください。\n「ヘルプ」で使い方を確認できます！`,
        sender: 'ai',
      },
    ]);
  }, []);

  // Save events when changed
  useEffect(() => {
    if (isLoaded) {
      saveEvents(events);
    }
  }, [events, isLoaded]);

  // Schedule notifications for today's upcoming events
  useEffect(() => {
    if (notificationsEnabled && events.length > 0) {
      const today = new Date();
      const todayEvents = filterEventsByDate(events, today);
      todayEvents.forEach(scheduleNotification);
    }
  }, [events, notificationsEnabled]);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleAddEvent = useCallback(
    (event: CalendarEvent) => {
      setEvents((prev) => [...prev, event]);
      // Schedule notification if enabled
      if (notificationsEnabled) {
        scheduleNotification(event);
      }
    },
    [notificationsEnabled]
  );

  const handleDeleteEvent = useCallback((id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const handleToggleNotifications = async () => {
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      return;
    }
    const granted = await requestNotificationPermission();
    setNotificationsEnabled(granted);
  };

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    const userMsg = { id: Date.now().toString(), text: inputValue, sender: 'user' as const };
    setMessages((prev) => [...prev, userMsg]);
    const currentInput = inputValue;
    setInputValue('');
    setIsTyping(true);

    // Simulate typing delay (no API call!)
    setTimeout(() => {
      const result = parseAIResponse(currentInput, events);
      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 1).toString(), text: result.text, sender: 'ai' },
      ]);
      setIsTyping(false);
    }, 600 + Math.random() * 600);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const days = getMonthDays(currentDate);
  const selectedDayEvents = filterEventsByDate(events, selectedDate);

  const getEventColor = (colorName?: string) => {
    return EVENT_COLORS.find((c) => c.name === colorName)?.value || EVENT_COLORS[0].value;
  };

  return (
    <div className="container">
      {/* Header */}
      <header className="header justify-between">
        <div className="flex items-center gap-3">
          <div className="header-logo">
            <CalendarIcon size={22} />
          </div>
          <div>
            <h1 className="text-lg font-bold" style={{ lineHeight: 1.2 }}>
              AI Secretary
            </h1>
            <p className="text-xs text-muted">スマート予定管理</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-ghost flex items-center gap-1"
            onClick={handleToggleNotifications}
            title={notificationsEnabled ? '通知をオフにする' : '通知をオンにする'}
          >
            {notificationsEnabled ? (
              <Bell size={18} color="var(--primary)" />
            ) : (
              <BellOff size={18} />
            )}
          </button>
        </div>
      </header>

      {/* Main Grid */}
      <main className="app-grid">
        {/* Calendar Section */}
        <div className="card">
          <div className="calendar-header">
            <h2 className="text-lg font-bold">
              {format(currentDate, 'yyyy年 M月', { locale: ja })}
            </h2>
            <div className="flex items-center gap-2">
              <button className="calendar-nav-btn" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
                <ChevronLeft size={18} />
              </button>
              <button className="calendar-today-btn" onClick={() => { setCurrentDate(new Date()); setSelectedDate(new Date()); }}>
                今日
              </button>
              <button className="calendar-nav-btn" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          <div className="calendar-body">
            <div className="calendar-grid">
              {['日', '月', '火', '水', '木', '金', '土'].map((day, i) => (
                <div key={day} className={`calendar-day-header ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}`}>
                  {day}
                </div>
              ))}

              {days.map((day, idx) => {
                const dayEvents = filterEventsByDate(events, day);
                const isToday = isSameDay(day, new Date());
                const isSelected = isSameDay(day, selectedDate);
                const notCurrentMonth = !isSameMonth(day, currentDate);
                const dayOfWeek = day.getDay();

                return (
                  <div
                    key={idx}
                    className={`calendar-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${notCurrentMonth ? 'other-month' : ''}`}
                    onClick={() => setSelectedDate(day)}
                  >
                    <span className={`day-number ${dayOfWeek === 0 ? 'sun' : dayOfWeek === 6 ? 'sat' : ''}`}>
                      {isToday ? (
                        <span className="day-number" style={{
                          background: 'var(--primary)', color: 'white', borderRadius: '50%',
                          width: 26, height: 26, display: 'inline-flex', alignItems: 'center',
                          justifyContent: 'center', fontWeight: 600, fontSize: '0.8rem'
                        }}>
                          {format(day, 'd')}
                        </span>
                      ) : (
                        format(day, 'd')
                      )}
                    </span>
                    {dayEvents.slice(0, 3).map((event) => (
                      <div
                        key={event.id}
                        className={`event-chip`}
                        style={{ backgroundColor: getEventColor(event.color) }}
                      >
                        {event.title}
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="text-xs text-muted">+{dayEvents.length - 3}</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Selected Day Detail */}
            <div className="day-detail">
              <div className="day-detail-header">
                <h3 className="day-detail-title">
                  📅 {format(selectedDate, 'M月d日(E)', { locale: ja })}の予定
                </h3>
                <button className="btn-add" onClick={() => setShowAddModal(true)}>
                  <Plus size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2 }} />
                  追加
                </button>
              </div>

              {selectedDayEvents.length > 0 ? (
                selectedDayEvents
                  .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                  .map((event) => (
                    <div key={event.id} className="event-card" style={{ borderLeftColor: getEventColor(event.color) }}>
                      <div>
                        <div className="event-card-time">{formatEventTime(event.date)}</div>
                        <div className="event-card-title">{event.title}</div>
                        {event.description && <div className="event-card-desc">{event.description}</div>}
                      </div>
                      <button className="btn-delete" onClick={() => handleDeleteEvent(event.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
              ) : (
                <div className="no-events">予定はありません ✨</div>
              )}
            </div>
          </div>
        </div>

        {/* Chat Section */}
        <div className="card chat-container">
          <div className="chat-header">
            <div className="flex items-center gap-2">
              <div className="chat-header-status" />
              <span className="font-bold text-sm">AI アシスタント</span>
            </div>
            <span className="text-xs text-muted">ローカル処理 • 無料</span>
          </div>

          <div className="chat-messages">
            {messages.map((msg) => (
              <div key={msg.id} className={`message ${msg.sender}`}>
                {msg.text.split('\n').map((line, i) => (
                  <React.Fragment key={i}>
                    {line}
                    {i < msg.text.split('\n').length - 1 && <br />}
                  </React.Fragment>
                ))}
              </div>
            ))}
            {isTyping && (
              <div className="typing-indicator">
                <div className="typing-dot" />
                <div className="typing-dot" />
                <div className="typing-dot" />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-area">
            <input
              type="text"
              placeholder="予定について質問してみよう..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button className="btn-icon" onClick={handleSendMessage} disabled={!inputValue.trim()}>
              <Send size={16} />
            </button>
          </div>
        </div>
      </main>

      {/* Add Event Modal */}
      <AddEventModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAddEvent}
        defaultDate={selectedDate}
      />
    </div>
  );
}
