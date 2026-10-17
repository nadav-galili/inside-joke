import { isClerkAPIResponseError, useSignIn, useSignUp } from '@clerk/expo';
import { useSignInWithApple } from '@clerk/expo/apple';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import logo from '../../assets/logo.png';
import { Body, Button, ErrorText, Eyebrow, Field, Pressy, Rise, Screen } from '../components/ui';
import { openPage } from '../lib/api';
import { SAMPLES } from '../lib/samples';
import { STYLE_LABELS } from '../lib/styles';
import { colors as c, fonts, radius, type } from '../lib/theme';

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
        <View style={{ gap: 6 }}>
          <Body small muted style={{ textAlign: 'center' }}>
            Your first video is free.
          </Body>
          <View style={styles.legalRow}>
            <Text style={styles.legal}>By continuing, you agree to the</Text>
            <Pressy haptic="none" accessibilityRole="link" onPress={() => openPage('/terms')}>
              <Text style={[styles.legal, styles.link]}>Terms</Text>
            </Pressy>
            <Text style={styles.legal}>and</Text>
            <Pressy haptic="none" accessibilityRole="link" onPress={() => openPage('/privacy')}>
              <Text style={[styles.legal, styles.link]}>Privacy Policy</Text>
            </Pressy>
          </View>
        </View>
      }
    >
      <View style={styles.posters} accessibilityElementsHidden>
        {SAMPLES.slice(0, 3).map((p, i) => (
          <Animated.View
            key={p.title}
            entering={FadeInUp.delay(120 + i * 110)
              .springify()
              .damping(14)}
            style={[
              styles.poster,
              {
                transform: [{ rotate: `${(i - 1) * 9}deg` }, { translateY: Math.abs(i - 1) * 18 }],
              },
            ]}
          >
            <Image source={p.poster} style={styles.still} />
            <Text style={styles.stillTag}>{STYLE_LABELS[p.genre].label.toUpperCase()}</Text>
          </Animated.View>
        ))}
      </View>
      <Rise index={3}>
        <View style={styles.hero}>
          <Image source={logo} accessibilityLabel="Inside Joke" style={styles.logo} />
          <Text style={[type.hero, { color: c.text }]}>
            Take your seat.{'\n'}
            <Text style={{ color: c.accent }}>The show's about to start.</Text>
          </Text>
          <Body muted>
            Sign in to cast your friends and make your first film. Your account keeps your groups,
            scripts and films together.
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

const styles = StyleSheet.create({
  posters: { flexDirection: 'row', justifyContent: 'center', marginTop: 24, marginBottom: 8 },
  poster: {
    width: 116,
    marginHorizontal: -8,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.card,
  },
  still: { width: '100%', aspectRatio: 9 / 16 },
  stillTag: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    fontFamily: fonts.scriptBold,
    fontSize: 9,
    letterSpacing: 1.2,
    color: '#ffffff',
    textShadowColor: '#000000cc',
    textShadowRadius: 4,
  },
  legalRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 4 },
  legal: { ...type.small, color: c.faint },
  link: { color: c.muted, textDecorationLine: 'underline' },
  hero: { gap: 14 },
  logo: { width: 76, height: 76, borderRadius: 18, marginBottom: 4 },
  or: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 2 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: c.border },
  code: { fontFamily: fonts.display, fontSize: 28, letterSpacing: 8, textAlign: 'center' },
});
