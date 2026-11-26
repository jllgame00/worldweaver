from openai import APIStatusError, AsyncOpenAI
from openai.types.chat import ChatCompletion
from openai.types.chat.completion_create_params import CompletionCreateParamsNonStreaming
from openai.types.responses import Response, ResponseCreateParams

from .chatkhu_config import ChatKHUAPI
from .openai_provider import INSTRUCTIONS, STRUCTURED_FORMAT, OpenAIProvider, normalized_usage, resolved_model
from .provider import GenerationReply, ProviderError


class ChatKHUProvider(OpenAIProvider):
    def __init__(
        self, client: AsyncOpenAI, *, api: ChatKHUAPI, max_output_tokens: int, max_input_bytes: int,
    ):
        super().__init__(client, max_output_tokens=max_output_tokens, max_input_bytes=max_input_bytes)
        self.api = api

    def _status_error(self, exc: APIStatusError) -> str:
        if exc.status_code == 402:
            return "provider_insufficient_credits"
        if exc.status_code == 403:
            return "provider_access_denied"
        return super()._status_error(exc)

    async def _send_responses(self, params: ResponseCreateParams) -> Response:
        params.pop("service_tier", None)
        if params["model"] == "gpt-6.1-sol":
            params["reasoning"] = {"effort": "low"}
        # The gateway documents slash-terminated paths. The client never follows redirects.
        return await self.client.post("responses/", cast_to=Response, body=params)

    async def _request_reply(self, model_id: str, creative_data: str) -> GenerationReply:
        if self.api == "responses":
            return await super()._request_reply(model_id, creative_data)

        params: CompletionCreateParamsNonStreaming = {
            "model": model_id,
            "messages": [{"role": "system", "content": INSTRUCTIONS}, {"role": "user", "content": creative_data}],
            "max_tokens": self.max_output_tokens,
            "response_format": {"type": "json_schema", "json_schema": STRUCTURED_FORMAT},
            "store": False,
        }
        if model_id == "gpt-6.1-sol":
            params["reasoning_effort"] = "low"
        response = await self.client.post("chat/completions/", cast_to=ChatCompletion, body=params)
        reported = response.usage
        usage = None if reported is None else normalized_usage(
            reported.prompt_tokens, reported.completion_tokens, getattr(reported, "total_tokens", None),
            getattr(getattr(reported, "prompt_tokens_details", None), "cached_tokens", None),
        )
        model = resolved_model(model_id, response.model)
        if len(response.choices) != 1:
            raise ProviderError("invalid_provider_response", usage=usage, model=model)
        choice = response.choices[0]
        if choice.message.refusal or choice.finish_reason == "content_filter":
            raise ProviderError("provider_refused", usage=usage, model=model)
        if choice.finish_reason == "length":
            raise ProviderError("provider_incomplete", usage=usage, model=model)
        if choice.finish_reason != "stop":
            raise ProviderError("invalid_provider_response", usage=usage, model=model)
        return GenerationReply(choice.message.content or "", usage, model)
