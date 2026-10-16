import { MAX_DISPLAY_NAME, MAX_GROUP_NAME, type GroupSummary } from '@insidejoke/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Body, Button, ErrorText, Field, Screen } from '../../components/ui';
import { track } from '../../lib/analytics';
import { useApi } from '../../lib/api';

export default function NewGroup() {
  const call = useApi();
  const [name, setName] = useState('');
  const [myName, setMyName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function create() {
    setBusy(true);
    try {
      const group = await call<GroupSummary>('/groups', {
        method: 'POST',
        body: JSON.stringify({ name, myName }),
      });
      track('group_created');
      router.replace(`/groups/${group.id}`);
    } catch {
      setError("We couldn't create the group. Please try again.");
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Field
        label="Group name"
        value={name}
        onChangeText={setName}
        placeholder="Poker Thursdays"
        maxLength={MAX_GROUP_NAME}
        autoFocus
      />
      <Field
        label="What does the group call you?"
        value={myName}
        onChangeText={setMyName}
        placeholder="Your nickname"
        maxLength={MAX_DISPLAY_NAME}
      />
      <Body muted>The script uses these names, so use the ones from your chat.</Body>
      <Button
        title="Create group"
        onPress={create}
        busy={busy}
        disabled={!name.trim() || !myName.trim()}
      />
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}
