{\rtf1\ansi\ansicpg1251\cocoartf2867
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\paperw11900\paperh16840\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\pard\tx720\tx1440\tx2160\tx2880\tx3600\tx4320\tx5040\tx5760\tx6480\tx7200\tx7920\tx8640\pardirnatural\partightenfactor0

\f0\fs24 \cf0 # QGC Web Publication\
\
Separate publication repository for generating and deploying a web result based on prepared QGroundControl / Maritime GCS analytical documents.\
\
## Scope\
\
This repository is responsible for:\
- transforming markdown research documents into web content\
- generating the frontend/project structure\
- storing the publication-ready project\
- deployment through GitHub + Vercel\
\
## Content source\
\
The analytical documents used as source content are stored in `source-docs/`.\
\
Initial document set:\
- 00_INDEX.md\
- 01_CODEBASE_AUDIT_REPORT.md\
- 02_SYSTEM_ARCHITECTURE.md\
- 03_DATA_FLOW.md\
- 04_PRODUCT_LOGIC.md\
- 05_ARCHITECTURE_DECISIONS.md\
- 06_GAP_ANALYSIS.md\
- 07_TARGET_ARCHITECTURE.md\
\
## Repository boundaries\
\
Important rules:\
- do not mix this repo with the original research repo\
- do not treat this repo as source-of-truth for research\
- use the research documentation as the canonical content base\
- use this repo only for publication workflow\
\
## Planned flow\
\
`markdown source docs -> agents -> frontend/project generation -> GitHub -> Vercel`}