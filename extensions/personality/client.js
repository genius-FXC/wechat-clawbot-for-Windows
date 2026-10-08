// Inserted into the existing clawbot browser factory. Uses the same form/store.
function PersonalityText({ value, field, disabled, commit, limit, multiline, label, placeholder }) {
  const [draft, setDraft] = useState(value || "");
  useEffect(() => { setDraft(value || ""); }, [value]);
  return h(multiline ? "textarea" : "input", {
    className: multiline ? S.area : S.input,
    type: multiline ? undefined : "text", rows: multiline ? 5 : undefined,
    "aria-label": label, disabled, maxLength: limit, value: draft,
    placeholder: placeholder ?? (multiline ? "例如：先接住我的感受，少用客服套话；有不同意见时坦诚说。" : "留空使用原来的称呼"),
    onChange: event => setDraft(event.target.value),
    onBlur: () => { if (draft !== (value || "")) void commit(field, draft); },
  });
}

function PersonalityFields({ value: v, user, disabled, set, clear }) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(0);
  const config = normalizePersonality(v);
  const commit = async (field, value, reset = false) => {
    setError(""); setPending(count => count + 1);
    try { await (reset ? clear(field) : set(field, value)); }
    catch { setError("性格设置未能保存，请检查 DSH 连接后重试。"); }
    finally { setPending(count => count - 1); }
  };
  const field = (key, label, hint, control, inline) => Field({
    label, hint, disabled, control, inline,
    overridden: Object.hasOwn(user, key), onReset: () => { void commit(key, undefined, true); },
  });
  const choose = (key, label, hint) => field(key, label, hint,
    h("select", { className: S.input, "aria-label": label, disabled,
      value: config[key], onChange: event => { void commit(key, event.target.value); } },
      PERSONALITY_CHOICES[key].map(item => h("option", { key: item.id, value: item.id }, item.label))));
  const text = (key, label, hint, multiline = false) => field(key, label, hint,
    h(PersonalityText, { value: config[key], field: key, label, disabled, commit, multiline, limit: multiline ? 2000 : 60 }));
  const preview = buildPersonalityPrompt(v);
  return h("section", { "aria-label": "性格与聊天风格", style: {border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 10, padding: 16, marginBottom: 20} },
    h("p", { className: S.label, style: {marginTop: 0} }, "性格与聊天风格"),
    h("p", { className: S.hint }, "只影响微信 Bot。修改后下次回复生效；文字离开输入框后保存。"),
    field("personaEnabled", "启用性格设置", config.personaEnabled ? "已启用：闲聊和办事会采用下方风格。" : "尚未启用；可以先调整选项再开启。",
      null, h(Switch, {label: "启用性格设置", on: config.personaEnabled, disabled, onChange: next => { void commit("personaEnabled", next); }})),
    choose("personaPreset", "性格预设", "选择一个基础性格，再用下方选项细调。"),
    text("personaName", "Bot 名字", "最多 60 字，留空不指定名字。"),
    text("personaUserName", "怎样称呼你", "最多 60 字，自然使用，不会每句都叫。"),
    choose("personaCloseness", "亲近程度", "控制相处的语气和距离。"),
    choose("personaReplyLength", "闲聊回复长度", "工作任务仍按你的要求给出必要结果。"),
    choose("personaHumor", "幽默程度", "遇到认真或低落的话题会注意分寸。"),
    choose("personaFollowup", "聊天追问习惯", "控制当前聊天中的追问；主动问候和定时联系将在后续单独设置。"),
    text("personaInstructions", "自定义性格说明", "最多 2000 字，补充口吻、习惯或你不喜欢的表达。", true),
    pending ? h("p", {className: S.hint, role: "status"}, "保存中…") : null,
    error ? h("p", {className: S.failed, role: "alert"}, error) : null,
    h("details", null,
      h("summary", {style: {cursor: "pointer"}}, "查看已保存的性格提示词"),
      h("p", {className: S.hint}, "这是实际注入的性格部分，不是模型回复；预览不会调用模型或发送微信。emoji 沿用下方开关。"),
      h("pre", {style: {whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 320, overflow: "auto", fontSize: 12}}, preview || "性格设置关闭时不注入额外提示词。")),
  );
}
