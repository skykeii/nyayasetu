# References

Research used in NyayaSetu, traced to the code that implements it. These are the papers on slide 6 of the SIH deck and the one presented at the end of the demo video. Links point to each publisher's page; the papers are not copied here because most are under publisher copyright.

**Use:** *Built* = the method as published. *Adapted* = the method with the changes listed. *Concept* = the idea, not the model.

## Presented in the demo video

**Monge, A. E. and Elkan, C. P. (1996).** The field matching problem: algorithms and applications. *Proceedings of the Second International Conference on Knowledge Discovery and Data Mining (KDD-96)*, 267–270. AAAI. [Paper page](https://aaai.org/papers/kdd96-044-the-field-matching-problem-algorithms-and-applications/) · [PDF](https://cdn.aaai.org/KDD/1996/KDD96-044.pdf)

*Adapted*, in `nameSimilarity` (`lib/text.ts`), which `resolveInstitution` (`lib/resolve.ts`) and the overlap engine (`lib/overlap.ts`) use to decide whether two differently written names are the same institution.

| The paper | NyayaSetu |
| --- | --- |
| Split each field into atomic strings and drop stop words | `normName` tokenises; `distinctiveTokens` drops stop words and generic words such as "institute" and "college" |
| Each word of A takes its best-matching word of B | Each token takes its best match by Levenshtein ratio |
| Score = mean of those best matches over A | Sum of best matches of at least 0.78, divided by the longer token list, so the score is symmetric |
| Abbreviations: prefix, prefix + suffix, acronym ("UCSD"), joined prefixes | A fixed abbreviation table (`inst`, `engg`, `clg`, …) and an acronym rule scored 0.88 ("KTIT", "KPCE") |
| Recursive over subfields | One level of tokens only |

## Other papers on the deck

| Paper | Method and where it runs | Use |
| --- | --- | --- |
| Salton, G. and Buckley, C. (1988). Term-weighting approaches in automatic text retrieval. *Information Processing & Management* 24(5), 513–523. [doi:10.1016/0306-4573(88)90021-0](https://doi.org/10.1016/0306-4573(88)90021-0) | Log TF × IDF with cosine normalisation; IDF is smoothed. `buildTfidf`, `cosine` in `lib/text.ts` | Built |
| Wagner, R. A. and Fischer, M. J. (1974). The string-to-string correction problem. *Journal of the ACM* 21(1), 168–173. [doi:10.1145/321796.321811](https://doi.org/10.1145/321796.321811) | The edit-distance dynamic program. `levenshtein` in `lib/text.ts` | Built |
| Levenshtein, V. I. (1966). Binary codes capable of correcting deletions, insertions, and reversals. *Soviet Physics Doklady* 10(8), 707–710 | Edit distance, used on institution names and Permanent IDs (`pidSimilarity`) | Built |
| Galler, B. A. and Fischer, M. J. (1964). An improved equivalence algorithm. *Communications of the ACM* 7(5), 301–303. [doi:10.1145/364099.364331](https://doi.org/10.1145/364099.364331) | Union-find forest that groups overlapping pairs into clusters, with path compression. `lib/overlap.ts` | Built |
| Sandhu, R. S., Coyne, E. J., Feinstein, H. L. and Youman, C. E. (1996). Role-based access control models. *IEEE Computer* 29(2), 38–47. [doi:10.1109/2.485845](https://doi.org/10.1109/2.485845) | Core role-based access control, without a role hierarchy. `lib/roles.ts`, `middleware.ts`, `lib/server.ts` | Adapted |
| Bühlmann, H. (1967). Experience rating and credibility. *ASTIN Bulletin* 4(3), 199–207. [doi:10.1017/S0515036100008989](https://doi.org/10.1017/S0515036100008989) | Credibility weight n / (n + k), shrinking each risk factor towards the peer mean. `lib/risk.ts`; k is set by hand, not estimated from variance | Adapted |
| Haber, S. and Stornetta, W. S. (1991). How to time-stamp a digital document. *Journal of Cryptology* 3(2), 99–111. [doi:10.1007/BF00196791](https://doi.org/10.1007/BF00196791) | Each audit entry stores the hash of the one before (`auditHash`, `verifyAudit` in `lib/store.ts`); there is no external witness | Adapted |
| Fellegi, I. P. and Sunter, A. B. (1969). A theory for record linkage. *Journal of the American Statistical Association* 64(328), 1183–1210. [doi:10.1080/01621459.1969.10501049](https://doi.org/10.1080/01621459.1969.10501049) | Link, possible link or non-link, with human review of the middle band. Our score is a fixed weighted sum, not their match probabilities | Concept |

## External components, not our research

Whisper (speech to text) and Llama or GPT-OSS models through Groq; AES-256-GCM through Node's `crypto` module.

## Policy and data sources cited on the deck

The Digital Personal Data Protection Act, 2023; the AICTE Approval Process Handbook 2022–23, Appendix 15; CPGRAMS ([pgportal.gov.in](https://pgportal.gov.in)); and the PIB year-end review 2024 (PRID 2088575). These are listed as the deck gives them; they are not linked to code.
