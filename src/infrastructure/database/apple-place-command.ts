import { randomUUID } from 'expo-crypto';
import { bindApplePlace, type BindApplePlaceCommand } from '@/application/place/bind-apple-place';
import { runInApplePlaceBindingTransaction } from './index';

export const bindApplePlaceCommand: BindApplePlaceCommand = (input) => bindApplePlace(input, {
  createPlaceId: randomUUID,
  now: () => new Date().toISOString(),
  runInTransaction: runInApplePlaceBindingTransaction,
});
