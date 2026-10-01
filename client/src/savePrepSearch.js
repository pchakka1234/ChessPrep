import { supabase } from './supabaseClient';

export async function savePrepSearch({
  opponentUsername,
  colorFilter,
  timeRangeMonths,
}) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) throw authError;
  if (!user) throw new Error('Sign in before saving a prep search.');

  const { data, error } = await supabase
    .from('prep_searches')
    .insert({
      user_id: user.id,
      opponent_username: opponentUsername,
      target_platform: 'chess_com',
      color_to_prepare: colorFilter,
      time_range_months: timeRangeMonths,
      status: 'completed',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}