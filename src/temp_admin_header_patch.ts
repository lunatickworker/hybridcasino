// 이 패치는 AdminHeader.tsx의 726-783 라인을 대체합니다
// 관리자 입출금 신청 알림 처리를 추가합니다

          if (payload.eventType === 'INSERT' && payload.new) {
            const transaction = payload.new as any;
            
            if (transaction.status === 'pending') {
              // ✅ 관리자 입출금 신청 처리 (admin_deposit, admin_withdrawal)
              if (transaction.transaction_type === 'admin_deposit' || transaction.transaction_type === 'admin_withdrawal') {
                // Lv2만 알림 받기
                if (user.level === 2) {
                  const metadata = transaction.metadata || {};
                  const requesterName = metadata.requester_name || '관리자';
                  const requesterLevel = metadata.requester_level || '?';
                  
                  if (transaction.transaction_type === 'admin_deposit') {
                    toast.info('새로운 관리자 입금 신청이 있습니다.', {
                      description: `금액: ${formatCurrency(Number(transaction.amount))} | 신청자: ${requesterName} (Lv${requesterLevel})\\n클릭하면 사라집니다.`,
                      duration: 10000,
                      position: 'bottom-left',
                      action: {
                        label: '확인',
                        onClick: () => {
                          if (onRouteChange) {
                            onRouteChange('/admin/transactions#deposit-request');
                          }
                        }
                      }
                    });
                  } else if (transaction.transaction_type === 'admin_withdrawal') {
                    toast.warning('새로운 관리자 출금 신청이 있습니다.', {
                      description: `금액: ${formatCurrency(Number(transaction.amount))} | 신청자: ${requesterName} (Lv${requesterLevel})\\n클릭하면 사라집니다.`,
                      duration: 10000,
                      position: 'bottom-left',
                      action: {
                        label: '확인',
                        onClick: () => {
                          if (onRouteChange) {
                            onRouteChange('/admin/transactions#withdrawal-request');
                          }
                        }
                      }
                    });
                  }
                }
                return; // 관리자 신청은 여기서 처리 완료
              }
              
              // ✅ 사용자 입출금 신청 처리 (deposit, withdrawal)
              // 🔐 조직격리: 해당 회원이 내 조직에 속하는지 확인
              const { data: transactionUser } = await supabase
                .from('users')
                .select('id, username, referrer_id')
                .eq('id', transaction.user_id)
                .single();
              
              if (!transactionUser) return; // 사용자 정보 없으면 알림 X
              
              // Lv1이면 모든 거래, Lv2+ 이면 하위 조직만
              let shouldNotify = false;
              if (user.level === 1) {
                shouldNotify = true;
              } else {
                // 하위 조직에 속하는지 확인
                const descendantIds = await getDescendantUserIds(user.id);
                shouldNotify = descendantIds.includes(transaction.user_id);
              }
              
              if (!shouldNotify) return; // 내 조직이 아니면 알림 X
              
              const username = transactionUser.username || transaction.user_id;
              
              if (transaction.transaction_type === 'deposit') {
                toast.info('새로운 입금 요청이 있습니.', {
                  description: `금액: ${formatCurrency(Number(transaction.amount))} | 회원: ${username}\\n클릭하면 사라집니다.`,
                  duration: 10000,
                  position: 'bottom-left',
                  action: {
                    label: '확인',
                    onClick: () => {
                      if (onRouteChange) {
                        onRouteChange('/admin/transactions#deposit-request');
                      }
                    }
                  }
                });
              } else if (transaction.transaction_type === 'withdrawal') {
                toast.warning('새로운 출금 요청이 있습니다.', {
                  description: `금액: ${formatCurrency(Number(transaction.amount))} | 회원: ${username}\\n클릭하면 사라집니다.`,
                  duration: 10000,
                  position: 'bottom-left',
                  action: {
                    label: '확인',
                    onClick: () => {
                      if (onRouteChange) {
                        onRouteChange('/admin/transactions#withdrawal-request');
                      }
                    }
                  }
                });
              }
            }
          }
