import { MAX_DISPLAY_NAME, MAX_GROUP_NAME, type GroupSummary } from '@insidejoke/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import {
  Body,
  Button,
  ErrorText,
  Eyebrow,
  Field,
  Screen,
  success,
  Title,
} from '../../components/ui';
import { track } from '../../lib/analytics';
import { useApi } from '../../lib/api';

export default function NewGroup() {
  const call = useApi();
  const [name, setName] = useState('');
  const [myName, setMyName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const missing = !name.trim() ? 'Name the group' : !myName.trim() ? 'Add your nickname' : null;

  async function create() {
    if (missing || busy) return;
    setBusy(true);
    try {
      const group = await call<GroupSummary>('/groups', {
        method: 'POST',
        body: JSON.stringify({ name, myName }),
      });
      track('group_created');
      success();
      router.replace(`/groups/${group.id}`);
    } catch {
      setError("We couldn't create the group. Please try again.");
      setBusy(false);
    }
  }

  return (
    <Screen
      footer={
        <>
          <ErrorText>{error}</ErrorText>
          <Button
            title={missing ?? 'Create group'}
            onPress={create}
            busy={busy}
            disabled={!!missing}
            testID="create-group"
          />
        </>
      }
    >
      <View style={{ gap: 10, marginTop: 4 }}>
        <Eyebrow>New group</Eyebrow>
        <Title>Who's in the chat?</Title>
        <Body muted>The script uses these names, so use the ones from your chat.</Body>
      </View>
      <Field
        label="Group name"
        value={name}
        onChangeText={setName}
        placeholder="Poker Thursdays"
        maxLength={MAX_GROUP_NAME}
        autoFocus
        returnKeyType="next"
        testID="group-name"
      />
      <Field
        label="What does the group call you?"
        value={myName}
        onChangeText={setMyName}
        placeholder="Your nickname"
        maxLength={MAX_DISPLAY_NAME}
        returnKeyType="done"
        onSubmitEditing={create}
        testID="my-name"
      />
    </Screen>
  );
}
