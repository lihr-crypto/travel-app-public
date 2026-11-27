import { useEffect, useRef, useState, type ReactNode } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ItemDraft } from '@/application/item/item-draft';
import type { DayPeriod, ItemPayload, ItemType, TimeMode, TransportMode, TransportPayload } from '@/domain/item/types';
import { colors } from '@/theme/tokens';
import {
  dateForLocalDayTime,
  defaultEndPickerDate,
  localTimeFromPickerDate,
  travelLocalDateTimeFromPicker,
} from './item-time-picker-adapter';
import { AppButton } from './ui/app-button';

const periods: readonly DayPeriod[] = ['morning', 'noon', 'afternoon', 'night'];
const periodLabels: Record<DayPeriod, string> = {
  morning: '上午', noon: '中午', afternoon: '下午', night: '晚上',
};
const itemTypes: readonly ItemType[] = [
  'sightseeing', 'food', 'hotel', 'activity', 'transport', 'custom',
];
const itemTypeLabels: Record<ItemType, string> = {
  sightseeing: '景点', food: '餐饮', hotel: '住宿',
  activity: '活动', transport: '交通', custom: '其他',
};
const transportModes: readonly TransportMode[] = [
  'flight', 'train', 'bus', 'ferry', 'car',
];
const transportModeLabels: Record<TransportMode, string> = {
  flight: '航班', train: '火车', bus: '巴士', ferry: '轮渡', car: '用车',
};

/** Type-aware clock labels: a Hotel stay is 入住/退房, a movement is 出发/到达. */
function timeLabelsFor(type: ItemType) {
  if (type === 'hotel') {
    return { start: '入住时间', startShort: '入住', end: '退房', addEnd: '添加退房时间' };
  }
  if (type === 'transport') {
    return { start: '出发时间', startShort: '出发', end: '到达', addEnd: '添加到达时间' };
  }
  return { start: '开始时间', startShort: '开始', end: '结束', addEnd: '添加结束时间' };
}

function initialTransportText(
  payload: ItemPayload | null | undefined,
  field: 'origin' | 'destination' | 'serviceNumber',
): string {
  return payload && payload.kind === 'transport' && typeof payload[field] === 'string'
    ? payload[field]
    : '';
}

function initialTransportMode(
  payload: ItemPayload | null | undefined,
): TransportMode | undefined {
  return payload && payload.kind === 'transport' ? payload.mode : undefined;
}

/** Breathing room between a focused field and the top of the visible area. */
const FIELD_KEYBOARD_GAP = 24;

/** The fields that raise the keyboard, in the order they appear. */
type TextField = 'title' | 'transportOrigin' | 'transportDestination' | 'transportServiceNumber' | 'customLabel' | 'note';
type FieldSection = 'basic' | 'transport' | 'notes';
type FieldRegion = 'customType';

/** Which clock row currently owns the inline wheel; null means collapsed. */
type OpenTimePicker = 'start' | 'end' | null;

function timePart(value: string | null | undefined, fallback = '09:00') {
  if (!value) return fallback;
  const separator = value.indexOf('T');
  const time = separator < 0 ? value : value.slice(separator + 1);
  return time.slice(0, 5) || fallback;
}

function initialCustomLabel(payload: ItemPayload | null | undefined) {
  return payload && 'label' in payload ? payload.label : '';
}

function payloadForType(
  type: ItemType,
  existing: ItemPayload | null | undefined,
  customLabel: string,
  transport: {
    mode: TransportMode | undefined;
    origin: string;
    destination: string;
    serviceNumber: string;
  },
): ItemPayload | null {
  if (type === 'custom') {
    const label = customLabel.trim();
    return label ? { kind: 'custom', label } : null;
  }
  if (type === 'hotel') {
    return { kind: 'hotel' };
  }
  if (type === 'transport') {
    const payload: TransportPayload = { kind: 'transport' };
    if (transport.mode !== undefined) payload.mode = transport.mode;
    const origin = transport.origin.trim();
    if (origin) payload.origin = origin;
    const destination = transport.destination.trim();
    if (destination) payload.destination = destination;
    const serviceNumber = transport.serviceNumber.trim();
    if (serviceNumber) payload.serviceNumber = serviceNumber;
    return payload;
  }
  // sightseeing / food / activity carry no payload semantics in V1.
  return null;
}

function ChoiceChip({
  title, selected, onPress, testID, compact = false, grid = false,
}: {
  title: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
  compact?: boolean;
  grid?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        compact ? styles.compactChip : null,
        grid ? styles.gridChip : null,
        selected ? styles.chipSelected : null,
      ]}
      testID={testID}
    >
      <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>
        {title}
      </Text>
    </Pressable>
  );
}

/** A compact `label ......... value ›` row; the whole row is the touch target. */
function ValueRow({
  label,
  value,
  onPress,
  testID,
  valueTestID,
  trailing,
  placeholder = false,
}: {
  label: string;
  value: string;
  onPress: () => void;
  testID: string;
  valueTestID?: string;
  trailing?: ReactNode;
  placeholder?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={`${label} ${value}`}
      accessibilityRole="button"
      onPress={onPress}
      style={styles.valueRow}
      testID={testID}
    >
      <Text style={styles.valueRowLabel}>{label}</Text>
      <View style={styles.valueRowRight}>
        <Text
          numberOfLines={1}
          style={placeholder ? styles.valueRowPlaceholder : styles.valueRowValue}
          testID={valueTestID}
        >
          {value}
        </Text>
        {trailing ?? <Text style={styles.chevron}>›</Text>}
      </View>
    </Pressable>
  );
}

export interface ItemDraftFormProps {
  initialDraft: ItemDraft;
  initialDate: string;
  testIDPrefix: 'quick-edit' | 'add-item-draft';
  onSave: (draft: ItemDraft) => Promise<void>;
  onCancel: () => void;
  /** When provided, save/cancel live in a persistent editor header. */
  headerTitle?: string;
  /** Optional secondary header context; defaults to the Day's Chinese date. */
  headerContext?: string;
  /**
   * The 地点 block, rendered under its own label directly below the name. The
   * editor keeps the location next to the name it falls back to, so the section
   * is a slot rather than footer content.
   */
  placeSection?: ReactNode;
  /** Location confirmation rendered within the same scrollable create form. */
  leadingContent?: ReactNode;
  onSavingChange?: (saving: boolean) => void;
  footerContent?: ReactNode;
  saveLabel?: string;
  cancelLabel?: string;
  /**
   * Reports the complete current draft on every edit.
   *
   * The Item editor owns the draft for the whole editing session, so leaving for
   * a sub-flow (Location Search) and coming back must not lose it. The form
   * stays the source of truth while it is mounted; this only mirrors it out.
   */
  onDraftChange?: (draft: ItemDraft) => void;
}

/** Shared create/edit fields with local-wall-clock time rows and reachable actions. */
export function ItemDraftForm({
  initialDraft,
  initialDate,
  testIDPrefix,
  onSave,
  onCancel,
  headerTitle,
  headerContext,
  placeSection,
  leadingContent,
  onSavingChange,
  footerContent,
  saveLabel = '保存',
  cancelLabel = '取消',
  onDraftChange,
}: ItemDraftFormProps) {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState(initialDraft.title);
  const [type, setType] = useState<ItemType>(initialDraft.type);
  const [customLabel, setCustomLabel] = useState(
    initialCustomLabel(initialDraft.payload),
  );
  const [transportMode, setTransportMode] = useState<TransportMode | undefined>(
    initialTransportMode(initialDraft.payload),
  );
  const [transportOrigin, setTransportOrigin] = useState(
    initialTransportText(initialDraft.payload, 'origin'),
  );
  const [transportDestination, setTransportDestination] = useState(
    initialTransportText(initialDraft.payload, 'destination'),
  );
  const [transportServiceNumber, setTransportServiceNumber] = useState(
    initialTransportText(initialDraft.payload, 'serviceNumber'),
  );
  const [timeMode, setTimeMode] = useState<TimeMode>(initialDraft.timeMode ?? 'none');
  const [hasStartTime, setHasStartTime] = useState(Boolean(initialDraft.startDateTime));
  const [startValue, setStartValue] = useState(() =>
    dateForLocalDayTime(initialDate, timePart(initialDraft.startDateTime)),
  );
  const [endValue, setEndValue] = useState(() =>
    dateForLocalDayTime(
      initialDate,
      timePart(initialDraft.endDateTime, localTimeFromPickerDate(
        defaultEndPickerDate(dateForLocalDayTime(initialDate, timePart(initialDraft.startDateTime))),
      )),
    ),
  );
  const [hasEndTime, setHasEndTime] = useState(Boolean(initialDraft.endDateTime));
  const [period, setPeriod] = useState<DayPeriod>(initialDraft.period ?? 'morning');
  const [note, setNote] = useState(initialDraft.note ?? '');
  const [openTimePicker, setOpenTimePicker] = useState<OpenTimePicker>(null);
  const [isSaving, setIsSaving] = useState(false);
  const saving = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const noteFocused = useRef(false);
  /** Each field card's `y` inside the scroll content. */
  const sectionOffsets = useRef<Partial<Record<FieldSection, number>>>({});
  /** Nested field groups within a card, such as the optional custom label. */
  const regionOffsets = useRef<Partial<Record<FieldRegion, number>>>({});
  /** Each text field's `y` within its card. */
  const fieldOffsets = useRef<Partial<Record<TextField, number>>>({});
  const fieldSections = useRef<Partial<Record<TextField, FieldSection>>>({});
  const fieldRegions = useRef<Partial<Record<TextField, FieldRegion>>>({});

  /**
   * The editor's Save/Cancel live in a persistent header, so its container is a
   * Modal with no action row to keep above the keyboard. The create flow is the
   * opposite: it renders a Save/Cancel row below the fields.
   *
   * That difference is why the two containers use exactly one keyboard strategy
   * each. Enabling `KeyboardAvoidingView` and `automaticallyAdjustKeyboardInsets`
   * together double-compensate for the same keyboard.
   */
  const usesHeaderActions = headerTitle !== undefined;

  const rememberSectionOffset = (section: FieldSection) => (y: number) => {
    sectionOffsets.current[section] = y;
  };

  const rememberRegionOffset = (region: FieldRegion) => (y: number) => {
    regionOffsets.current[region] = y;
  };

  const rememberFieldOffset = (
    field: TextField,
    section?: FieldSection,
    region?: FieldRegion,
  ) => (y: number) => {
    fieldOffsets.current[field] = y;
    if (section) fieldSections.current[field] = section;
    else delete fieldSections.current[field];
    if (region) fieldRegions.current[field] = region;
    else delete fieldRegions.current[field];
  };

  /**
   * Neither strategy scrolls a focused input into view — they only change the
   * viewport. The note field sits at the bottom of a tall form, so it has to be
   * brought above the keyboard explicitly.
   *
   * The field's top is aligned near the top of the visible area rather than to
   * its bottom: the component cannot measure the keyboard synchronously when
   * focus fires, so a height-independent rule is the only one that is guaranteed
   * to clear it. `KeyboardAvoidingView` and `findNodeHandle` were both rejected
   * here — the former is already the container's job, and the latter's
   * measurement path is unavailable on this RN version's host instances.
   */
  const scrollFieldIntoView = (field: TextField) => {
    const scrollView = scrollRef.current;
    const localOffset = fieldOffsets.current[field];
    const section = fieldSections.current[field];
    const region = fieldRegions.current[field];
    if (scrollView === null || localOffset === undefined) return;
    const offset = localOffset
      + (region ? regionOffsets.current[region] ?? 0 : 0)
      + (section ? sectionOffsets.current[section] ?? 0 : 0);
    scrollView.scrollTo({ y: Math.max(0, offset - FIELD_KEYBOARD_GAP), animated: true });
  };

  const prefix = testIDPrefix;
  const timeLabels = timeLabelsFor(type);
  const headerDateLabel = `${initialDate.slice(0, 4)}年${Number(initialDate.slice(5, 7))}月${Number(initialDate.slice(8, 10))}日`;
  const headerContextLabel = headerContext ?? headerDateLabel;
  // The Day date is fixed for new values. Existing timestamp dates are retained
  // so editing a Hotel/Transport clock value cannot erase a deferred cross-day date.
  const startDateForSave = initialDraft.startDateTime?.slice(0, 10) ?? initialDate;
  const endDateForSave = initialDraft.endDateTime?.slice(0, 10) ?? startDateForSave;

  /** The one place the form's fields become an `ItemDraft`. */
  const composeDraft = (): ItemDraft => ({
    title,
    type,
    timeMode,
    startDateTime: timeMode === 'exact' && hasStartTime
      ? travelLocalDateTimeFromPicker(startDateForSave, startValue)
      : null,
    endDateTime: timeMode === 'exact' && hasEndTime
      ? travelLocalDateTimeFromPicker(endDateForSave, endValue)
      : null,
    period: timeMode === 'period' ? period : null,
    /*
     * `isFixed` is deliberately not sent. The user removed the control, and
     * omitting the field is what preserves it: `addItem` defaults a new Item to
     * false, while `updateItemDetails` keeps `current.isFixed` when the input
     * leaves it undefined.
     */
    note: note.trim() || null,
    payload: payloadForType(type, initialDraft.payload, customLabel, {
      mode: transportMode,
      origin: transportOrigin,
      destination: transportDestination,
      serviceNumber: transportServiceNumber,
    }),
  });

  /**
   * The latest reporter, kept current by an effect.
   *
   * The parent hands in a fresh closure every render, so depending on it
   * directly would re-run the mirror effect forever.
   */
  const draftReporter = useRef(onDraftChange);
  useEffect(() => {
    draftReporter.current = onDraftChange;
  });

  useEffect(() => {
    draftReporter.current?.(composeDraft());
    // The mirror must follow every field the draft is composed from; the
    // composer itself is recreated each render and is not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customLabel, endValue, hasEndTime, hasStartTime, note, period, startValue, timeMode, title, type, transportDestination, transportMode, transportOrigin, transportServiceNumber]);

  const handleSave = async () => {
    if (saving.current) return;
    setErrorMessage(null);
    if (timeMode === 'exact' && !hasStartTime && !hasEndTime) {
      setErrorMessage('具体时间至少需要设置开始或结束时间。');
      return;
    }
    saving.current = true;
    setIsSaving(true);
    onSavingChange?.(true);
    try {
      await onSave(composeDraft());
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : '保存失败，请重试。');
    } finally {
      saving.current = false;
      setIsSaving(false);
      onSavingChange?.(false);
    }
  };

  const enableStartTime = () => {
    setStartValue(dateForLocalDayTime(initialDate, timePart(initialDraft.startDateTime)));
    setHasStartTime(true);
    setOpenTimePicker('start');
  };

  const disableStartTime = () => {
    setHasStartTime(false);
    setOpenTimePicker((current) => (current === 'start' ? null : current));
  };

  const enableEndTime = () => {
    const base = hasStartTime
      ? startValue
      : dateForLocalDayTime(initialDate, '09:00');
    setEndValue(defaultEndPickerDate(base));
    setHasEndTime(true);
    setOpenTimePicker('end');
  };

  const disableEndTime = () => {
    setHasEndTime(false);
    setOpenTimePicker((current) => (current === 'end' ? null : current));
  };

  const handleCancel = () => {
    if (!saving.current) onCancel();
  };

  const formBody = (
    <>
      {headerTitle !== undefined ? (
        <View style={[styles.editorHeader, { paddingTop: 8 }]} testID={`${prefix}-header`}>
          <Pressable
            accessibilityRole="button"
            disabled={isSaving}
            onPress={handleCancel}
            style={styles.headerButton}
            testID={`${prefix}-close`}
          >
            <Text style={styles.backLabel}>‹ 返回</Text>
          </Pressable>
          <View style={styles.headerIdentity}>
            <Text numberOfLines={2} style={styles.headerTitle} testID={`${prefix}-header-title`}>
              {title.trim() || headerTitle}
            </Text>
            <Text style={styles.headerSubtitle} testID={`${prefix}-header-date`}>
              {`${headerContextLabel} · 编辑行程`}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={isSaving}
            onPress={() => void handleSave()}
            style={styles.saveHeaderButton}
            testID={`${prefix}-save`}
          >
            <Text style={styles.saveHeaderLabel}>
              {isSaving ? '保存中…' : saveLabel}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <ScrollView
        automaticallyAdjustKeyboardInsets={usesHeaderActions}
        contentContainerStyle={[
          styles.fields,
          // The header variant has no footer row, so the content owns the home
          // indicator clearance. Stacking it on the container as well would add
          // a gap above the keyboard.
          usesHeaderActions
            ? { gap: 12, paddingBottom: insets.bottom + 16, paddingHorizontal: 0 }
            : null,
        ]}
        keyboardShouldPersistTaps="handled"
        ref={scrollRef}
        testID={`${prefix}-fields`}
      >
        {leadingContent}
        <View
          onLayout={(event) => rememberSectionOffset('basic')(event.nativeEvent.layout.y)}
          style={[styles.sectionGroup, usesHeaderActions ? styles.sectionCard : null]}
          testID={`${prefix}-basic-section`}
        >
          {usesHeaderActions ? <Text style={styles.sectionTitle}>基本信息</Text> : null}
          <Text style={styles.label}>名称（可选）</Text>
          <TextInput
            accessibilityLabel="名称"
            onChangeText={setTitle}
            onFocus={() => scrollFieldIntoView('title')}
            onLayout={(event) => rememberFieldOffset('title', 'basic')(event.nativeEvent.layout.y)}
            placeholder="不填写时使用地点名称"
            placeholderTextColor={colors.textDisabled}
            returnKeyType="done"
            style={styles.input}
            testID={`${prefix}-title`}
            value={title}
          />

          {placeSection === undefined ? null : (
            <View style={styles.placeRegion} testID={`${prefix}-place-region`}>
              <Text style={styles.label}>地点</Text>
              {placeSection}
            </View>
          )}

          <Text style={styles.label}>类型</Text>
          <View style={styles.typeOptions} testID={`${prefix}-type`}>
            {itemTypes.map((value) => (
              <ChoiceChip
                grid
                key={value}
                title={itemTypeLabels[value]}
                selected={type === value}
                onPress={() => setType(value)}
                testID={`${prefix}-type-${value}`}
              />
            ))}
          </View>
          {type === 'custom' ? (
            <View
              onLayout={(event) => rememberRegionOffset('customType')(event.nativeEvent.layout.y)}
              style={styles.customTypeRegion}
              testID={`${prefix}-custom-type-region`}
            >
              <Text style={styles.fieldHint}>自定义类型</Text>
              <TextInput
                accessibilityLabel="自定义类型"
                maxLength={20}
                onChangeText={(value) => setCustomLabel(Array.from(value).slice(0, 20).join(''))}
                onFocus={() => scrollFieldIntoView('customLabel')}
                onLayout={(event) => rememberFieldOffset('customLabel', 'basic', 'customType')(event.nativeEvent.layout.y)}
                placeholder="例如：购物、拍照、探亲"
                placeholderTextColor={colors.textDisabled}
                style={styles.input}
                testID={`${prefix}-custom-label`}
                value={customLabel}
              />
            </View>
          ) : null}
        </View>

        {type === 'transport' ? (
          <View
            onLayout={(event) => rememberSectionOffset('transport')(event.nativeEvent.layout.y)}
            style={[styles.sectionGroup, styles.transportRegion, usesHeaderActions ? styles.sectionCard : null]}
            testID={`${prefix}-transport-fields`}
          >
            {usesHeaderActions ? <Text style={styles.sectionTitle}>交通信息</Text> : null}
            <Text style={styles.label}>出发地</Text>
            <TextInput
              accessibilityLabel="出发地"
              onChangeText={setTransportOrigin}
              onFocus={() => scrollFieldIntoView('transportOrigin')}
              onLayout={(event) => rememberFieldOffset('transportOrigin', 'transport')(event.nativeEvent.layout.y)}
              placeholder="例如：北京首都机场"
              placeholderTextColor={colors.textDisabled}
              style={styles.input}
              testID={`${prefix}-transport-origin`}
              value={transportOrigin}
            />
            <Text style={styles.label}>目的地</Text>
            <TextInput
              accessibilityLabel="目的地"
              onChangeText={setTransportDestination}
              onFocus={() => scrollFieldIntoView('transportDestination')}
              onLayout={(event) => rememberFieldOffset('transportDestination', 'transport')(event.nativeEvent.layout.y)}
              placeholder="例如：东城站"
              placeholderTextColor={colors.textDisabled}
              style={styles.input}
              testID={`${prefix}-transport-destination`}
              value={transportDestination}
            />
            <Text style={styles.label}>班次 / 车次 / 航班号（可选）</Text>
            <TextInput
              accessibilityLabel="班次"
              onChangeText={setTransportServiceNumber}
              onFocus={() => scrollFieldIntoView('transportServiceNumber')}
              onLayout={(event) => rememberFieldOffset('transportServiceNumber', 'transport')(event.nativeEvent.layout.y)}
              placeholder="例如：K101"
              placeholderTextColor={colors.textDisabled}
              style={styles.input}
              testID={`${prefix}-transport-service-number`}
              value={transportServiceNumber}
            />
            <Text style={styles.fieldHint}>方式</Text>
            <View style={styles.periodOptions} testID={`${prefix}-transport-modes`}>
              {transportModes.map((mode) => (
                <ChoiceChip
                  compact
                  key={mode}
                  selected={transportMode === mode}
                  title={transportModeLabels[mode]}
                  onPress={() => setTransportMode((current) => (current === mode ? undefined : mode))}
                  testID={`${prefix}-transport-mode-${mode}`}
                />
              ))}
            </View>
          </View>
        ) : null}

        <View style={[styles.sectionGroup, usesHeaderActions ? styles.sectionCard : null]} testID={`${prefix}-time-section`}>
        {usesHeaderActions ? <Text style={styles.sectionTitle}>时间</Text> : <Text style={styles.label}>时间</Text>}
        <View accessibilityRole="radiogroup" style={styles.segmented} testID={`${prefix}-time-mode`}>
          {(['none', 'period', 'exact'] as const).map((mode) => (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: timeMode === mode }}
              key={mode}
              onPress={() => {
                setTimeMode(mode);
                setOpenTimePicker(null);
              }}
              style={[styles.segment, timeMode === mode ? styles.segmentSelected : null]}
              testID={`${prefix}-time-${mode}`}
            >
              <Text style={[styles.segmentText, timeMode === mode ? styles.segmentTextSelected : null]}>
                {mode === 'none' ? '无时间' : mode === 'period' ? '时段' : '具体时间'}
              </Text>
            </Pressable>
          ))}
        </View>

        {timeMode === 'period' ? (
          <View style={styles.periodOptions} testID={`${prefix}-period-region`}>
            {periods.map((value) => (
              <ChoiceChip
                compact
                key={value}
                title={periodLabels[value]}
                selected={period === value}
                onPress={() => setPeriod(value)}
                testID={`${prefix}-period-${value}`}
              />
            ))}
          </View>
        ) : null}

        {/*
         * Exact time is a pair of compact rows. The wheel is mounted only while a
         * row is being edited, so the form never carries a permanently open
         * picker that makes the page tall before the user asks for it.
        */}
        {timeMode === 'exact' ? (
          <View style={styles.exactRegion} testID={`${prefix}-exact`}>
            {hasStartTime ? (
              <ValueRow
                label={hasEndTime ? timeLabels.startShort : timeLabels.start}
                onPress={() => setOpenTimePicker((current) => (current === 'start' ? null : 'start'))}
                testID={`${prefix}-start-row`}
                trailing={(
                  <Pressable
                    accessibilityLabel={`移除${timeLabels.start}`}
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={disableStartTime}
                    style={styles.removeButton}
                    testID={`${prefix}-start-remove`}
                  >
                    <Text style={styles.removeLabel}>移除</Text>
                  </Pressable>
                )}
                value={localTimeFromPickerDate(startValue)}
                valueTestID={`${prefix}-start-value`}
              />
            ) : (
              <ValueRow
                label={`添加${timeLabels.start}`}
                onPress={enableStartTime}
                testID={`${prefix}-start-row`}
                trailing={<Text style={styles.addLabel}>＋</Text>}
                value=""
              />
            )}
            {openTimePicker === 'start' && hasStartTime ? (
              <View style={styles.pickerRegion} testID={`${prefix}-start-picker-region`}>
                <DateTimePicker
                  textColor={colors.text}
                  display="spinner"
                  minuteInterval={5}
                  mode="time"
                  onValueChange={(_event, value) => setStartValue(value)}
                  testID={`${prefix}-start-picker`}
                  value={startValue}
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setOpenTimePicker(null)}
                  style={styles.pickerDone}
                  testID={`${prefix}-start-picker-done`}
                >
                  <Text style={styles.pickerDoneLabel}>完成</Text>
                </Pressable>
              </View>
            ) : null}

            {hasEndTime ? (
              <ValueRow
                label={timeLabels.end}
                onPress={() => setOpenTimePicker((current) => (current === 'end' ? null : 'end'))}
                testID={`${prefix}-end-row`}
                trailing={(
                  <Pressable
                    accessibilityLabel="移除结束时间"
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={disableEndTime}
                    style={styles.removeButton}
                    testID={`${prefix}-end-remove`}
                  >
                    <Text style={styles.removeLabel}>移除</Text>
                  </Pressable>
                )}
                value={localTimeFromPickerDate(endValue)}
                valueTestID={`${prefix}-end-value`}
              />
            ) : (
              <ValueRow
                label={timeLabels.addEnd}
                onPress={enableEndTime}
                testID={`${prefix}-end-add`}
                trailing={<Text style={styles.addLabel}>＋</Text>}
                value=""
              />
            )}
            {openTimePicker === 'end' && hasEndTime ? (
              <View style={styles.pickerRegion} testID={`${prefix}-end-picker-region`}>
                <DateTimePicker
                  textColor={colors.text}
                  display="spinner"
                  minuteInterval={5}
                  mode="time"
                  onValueChange={(_event, value) => setEndValue(value)}
                  testID={`${prefix}-end-picker`}
                  value={endValue}
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setOpenTimePicker(null)}
                  style={styles.pickerDone}
                  testID={`${prefix}-end-picker-done`}
                >
                  <Text style={styles.pickerDoneLabel}>完成</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}
        </View>

        <View
          onLayout={(event) => rememberSectionOffset('notes')(event.nativeEvent.layout.y)}
          style={[styles.sectionGroup, usesHeaderActions ? styles.sectionCard : null]}
          testID={`${prefix}-notes-section`}
        >
          {usesHeaderActions ? <Text style={styles.sectionTitle}>备注</Text> : <Text style={styles.label}>备注</Text>}
          <TextInput
            accessibilityLabel="备注"
            multiline
            onChangeText={setNote}
            onBlur={() => { noteFocused.current = false; }}
            /*
             * A multiline field grows as lines are added, so scrolling once on
             * focus is not enough: the caret would sink behind the keyboard again
             * while typing. Re-align on growth, but only while the field is
             * focused, so an unrelated re-render cannot yank the form.
             */
            onContentSizeChange={() => {
              if (noteFocused.current) scrollFieldIntoView('note');
            }}
            onFocus={() => {
              noteFocused.current = true;
              scrollFieldIntoView('note');
            }}
            onLayout={(event) => rememberFieldOffset('note', 'notes')(event.nativeEvent.layout.y)}
            placeholder="添加备注"
            placeholderTextColor={colors.textDisabled}
            style={[styles.input, styles.noteInput]}
            testID={`${prefix}-note`}
            value={note}
          />
        </View>
        {footerContent}
      </ScrollView>
      {errorMessage ? (
        <Text accessibilityRole="alert" style={[styles.error, { paddingHorizontal: 20 }]} testID={`${prefix}-error`}>{errorMessage}</Text>
      ) : null}

      {headerTitle === undefined ? (
        <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <AppButton
            disabled={isSaving}
            onPress={handleCancel}
            testID={`${prefix}-close`}
            title={cancelLabel}
            variant="secondary"
          />
          <AppButton
            disabled={isSaving}
            onPress={() => void handleSave()}
            testID={`${prefix}-save`}
            title={isSaving ? '保存中…' : saveLabel}
          />
        </View>
      ) : null}
    </>
  );

  /*
   * Exactly one keyboard strategy per container. The create flow keeps
   * `KeyboardAvoidingView` because it owns a Save/Cancel row that must stay
   * above the keyboard; the editor's header variant uses the ScrollView's own
   * keyboard insets instead, which is the pattern the Home form already uses.
   */
  if (usesHeaderActions) {
    return (
      <View style={styles.flex} testID={`${prefix}-form`}>
        {formBody}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.flex}
      testID={`${prefix}-form`}
    >
      {formBody}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  actions: { backgroundColor: colors.surface, borderTopColor: colors.borderSubtle, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 12, justifyContent: 'flex-end', paddingHorizontal: 20, paddingTop: 12 },
  addLabel: { color: colors.primary, fontSize: 18, fontWeight: '600' },
  chevron: { color: colors.textDisabled, fontSize: 20, lineHeight: 22 },
  chip: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 999, borderWidth: 1, justifyContent: 'center', minHeight: 40, paddingHorizontal: 13 },
  chipSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accentStrong },
  chipText: { color: colors.textSecondary, fontSize: 14, fontWeight: '500' },
  chipTextSelected: { color: colors.accentStrong, fontWeight: '700' },
  compactChip: { minHeight: 44, paddingHorizontal: 11 },
  customTypeRegion: { gap: 8, marginTop: 2 },
  transportRegion: { gap: 4, marginTop: 2 },
  editorHeader: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between', minHeight: 64, paddingBottom: 12 },
  error: { color: colors.danger, paddingVertical: 4 },
  exactRegion: { backgroundColor: colors.surfaceMuted, borderRadius: 12, gap: 2, paddingHorizontal: 12, paddingVertical: 4 },
  fieldHint: { color: colors.textSubtle, fontSize: 13, fontWeight: '600', marginTop: 2 },
  fields: { gap: 10, paddingHorizontal: 20, paddingVertical: 14 },
  flex: { flex: 1 },
  headerButton: { justifyContent: 'center', minHeight: 44, minWidth: 58 },
  backLabel: { color: colors.textSecondary, fontSize: 15, fontWeight: '500' },
  headerIdentity: { alignItems: 'center', flex: 1, gap: 2, minWidth: 0 },
  headerSubtitle: { color: colors.textSubtle, fontSize: 12, fontWeight: '500' },
  headerTitle: { color: colors.text, fontSize: 16, fontWeight: '700', maxWidth: '100%', textAlign: 'center' },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 8, borderWidth: 1, color: colors.text, minHeight: 44, paddingHorizontal: 12 },
  label: { color: colors.textSecondary, fontSize: 14, fontWeight: '600', marginTop: 4 },
  noteInput: { minHeight: 96, paddingVertical: 10, textAlignVertical: 'top' },
  periodOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  placeRegion: { gap: 10 },
  pickerDone: { alignSelf: 'flex-end', justifyContent: 'center', minHeight: 44, minWidth: 56 },
  pickerDoneLabel: { color: colors.primary, fontSize: 15, fontWeight: '600', textAlign: 'right' },
  pickerRegion: { borderTopColor: colors.borderSubtle, borderTopWidth: StyleSheet.hairlineWidth, paddingBottom: 4 },
  removeButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44 },
  removeLabel: { color: colors.danger, fontSize: 13, fontWeight: '600', paddingHorizontal: 4 },
  saveHeaderButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 11, justifyContent: 'center', minHeight: 44, minWidth: 64, paddingHorizontal: 12 },
  saveHeaderLabel: { color: colors.onPrimary, fontSize: 14, fontWeight: '700' },
  sectionCard: { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, gap: 8, padding: 14 },
  sectionGroup: { gap: 10 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 2 },
  segmented: { backgroundColor: colors.surfaceMuted, borderRadius: 10, flexDirection: 'row', padding: 4 },
  segment: { alignItems: 'center', borderRadius: 7, flex: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 5 },
  segmentSelected: { backgroundColor: colors.accentSoft, elevation: 1, shadowColor: colors.backdropLayer, shadowOpacity: 0.12, shadowRadius: 2 },
  segmentText: { color: colors.textSubtle, fontSize: 13, fontWeight: '600' },
  segmentTextSelected: { color: colors.accentStrong, fontWeight: '700' },
  typeOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridChip: { borderRadius: 12, flexBasis: '30%', flexGrow: 1, minHeight: 44, paddingHorizontal: 5 },
  valueRow: { alignItems: 'center', borderBottomColor: colors.borderSubtle, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 8, justifyContent: 'space-between', minHeight: 44 },
  valueRowLabel: { color: colors.textSecondary, fontSize: 15 },
  valueRowPlaceholder: { color: colors.textDisabled, fontSize: 15 },
  valueRowRight: { alignItems: 'center', flexDirection: 'row', flexShrink: 1, gap: 6, justifyContent: 'flex-end' },
  valueRowValue: { color: colors.text, fontSize: 15, fontVariant: ['tabular-nums'] },
});
