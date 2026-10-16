import { isClerkAPIResponseError, useSignIn, useSignUp } from '@clerk/expo';
import { useSignInWithApple } from '@clerk/expo/apple';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { GenrePoster } from '../components/cinema';
import { Body, Bulbs, Button, ErrorText, Eyebrow, Field, Rise, Screen } from '../components/ui';
import { colors as c, fonts, type } from '../lib/theme';

/** Sign in with Apple, or with a code sent by email. New emails are signed up on the way. */
export default function SignIn() {
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
    <Screen
      footer={
        <Body small muted style={{ textAlign: 'center' }}>
          Your first video is free.
        </Body>
      }
    >
      <View style={styles.posters} accessibilityElementsHidden>
        {POSTERS.map((p, i) => (
          <Animated.View
            key={p.title}
            entering={FadeInUp.delay(120 + i * 110)
              .springify()
              .damping(14)}
            style={[styles.poster, { transform: [{ rotate: p.tilt }, { translateY: p.drop }] }]}
          >
            <GenrePoster genre={p.genre} title={p.title} height={176} playable={i === 1} />
          </Animated.View>
        ))}
      </View>
      <Rise index={3}>
        <View style={styles.hero}>
          <Bulbs />
          <Text style={[type.hero, { color: c.text }]}>
            Your group chat,{'\n'}
            <Text style={{ color: c.accent }}>now showing.</Text>
          </Text>
          <Body muted>
            Turn the chat's best moment into a 15-second film starring your friends.
          </Body>
        </View>
      </Rise>
      <Rise index={4}>
        <View style={{ gap: 14 }}>
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={18}
            style={{ height: 56 }}
            onPress={apple}
          />
          <View style={styles.or}>
            <View style={styles.rule} />
            <Eyebrow color={c.faint}>or with email</Eyebrow>
            <View style={styles.rule} />
          </View>
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
                kind="secondary"
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
                autoFocus
                style={styles.code}
              />
              <Button
                title="Continue"
                onPress={verify}
                busy={busy}
                disabled={code.trim().length < 6}
              />
              <Button title="Use another email" kind="quiet" onPress={() => setStep('email')} />
            </>
          )}
          <ErrorText>{error}</ErrorText>
        </View>
      </Rise>
    </Screen>
  );
}

/** Sample posters for the welcome screen. Made-up titles in each genre, never real films. */
const POSTERS = [
  { genre: 'telenovela', title: 'Who Finished the Hummus', tilt: '-9deg', drop: 18 },
  { genre: 'action_trailer_80s', title: 'The Bluff of the Century', tilt: '0deg', drop: 0 },
  { genre: 'nature_documentary', title: 'Late Again, Dani', tilt: '9deg', drop: 18 },
] as const;

const styles = StyleSheet.create({
  posters: { flexDirection: 'row', justifyContent: 'center', marginTop: 24, marginBottom: 8 },
  poster: { width: 124, marginHorizontal: -10 },
  hero: { gap: 14 },
  or: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 2 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: c.border },
  code: { fontFamily: fonts.display, fontSize: 28, letterSpacing: 8, textAlign: 'center' },
});
