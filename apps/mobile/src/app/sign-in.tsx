import { isClerkAPIResponseError, useSignIn, useSignUp } from '@clerk/expo';
import { useSignInWithApple } from '@clerk/expo/apple';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useState } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { Body, Button, ErrorText, Field, Screen, Title } from '../components/ui';

/** Sign in with Apple, or with a code sent by email. New emails are signed up on the way. */
export default function SignIn() {
  const scheme = useColorScheme();
  const { startAppleAuthenticationFlow } = useSignInWithApple();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [isNewUser, setIsNewUser] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function apple() {
    setError('');
    try {
      const { createdSessionId, setActive } = await startAppleAuthenticationFlow();
      if (createdSessionId && setActive) await setActive({ session: createdSessionId });
    } catch (e) {
      if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return;
      setError('Sign in with Apple failed. Please try again.');
    }
  }

  async function sendCode() {
    setBusy(true);
    setError('');
    try {
      const sent = await signIn.emailCode.sendCode({ emailAddress: email.trim() });
      if (sent.error) {
        const notFound =
          isClerkAPIResponseError(sent.error) &&
          sent.error.errors[0]?.code === 'form_identifier_not_found';
        if (!notFound) throw sent.error;
        const created = await signUp.create({ emailAddress: email.trim() });
        if (created.error) throw created.error;
        const signUpSent = await signUp.verifications.sendEmailCode();
        if (signUpSent.error) throw signUpSent.error;
        setIsNewUser(true);
      }
      setStep('code');
    } catch {
      setError("We couldn't send a code to that email.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError('');
    try {
      if (isNewUser) {
        const res = await signUp.verifications.verifyEmailCode({ code: code.trim() });
        if (res.error || signUp.status !== 'complete')
          throw res.error ?? new Error(signUp.status ?? '');
        await signUp.finalize();
      } else {
        const res = await signIn.emailCode.verifyCode({ code: code.trim() });
        if (res.error || signIn.status !== 'complete') throw res.error ?? new Error(signIn.status);
        await signIn.finalize();
      }
    } catch {
      setError("That code didn't work. Check it and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <Title>Inside Joke</Title>
        <Body muted>
          Turn your group chat's best moment into a funny video starring your friends.
        </Body>
      </View>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={
          scheme === 'dark'
            ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
            : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
        }
        cornerRadius={14}
        style={{ height: 52 }}
        onPress={apple}
      />
      <Body muted style={{ textAlign: 'center' }}>
        or
      </Body>
      {step === 'email' ? (
        <>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
          />
          <Button
            title="Email me a code"
            onPress={sendCode}
            busy={busy}
            disabled={!email.includes('@')}
          />
        </>
      ) : (
        <>
          <Field
            label={`Code sent to ${email}`}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoComplete="one-time-code"
          />
          <Button title="Continue" onPress={verify} busy={busy} disabled={code.trim().length < 6} />
          <Button title="Use another email" kind="secondary" onPress={() => setStep('email')} />
        </>
      )}
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { marginTop: 80, marginBottom: 24, gap: 8 },
});
